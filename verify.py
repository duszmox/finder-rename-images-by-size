"""Exercise real JXA and sips on disposable PNG images. Requires Python 3."""
import json
import pathlib
import struct
import subprocess
import tempfile
import zlib

root = pathlib.Path(__file__).parent

def png(path, width, height):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    pixels = (b'\0' + bytes([width % 255, height % 255, 70]) * width) * height
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))

with tempfile.TemporaryDirectory(prefix='rename-image-test-') as temporary:
    base = pathlib.Path(temporary)
    cases = {}
    def folder(key, sizes, name=None):
        path = base / (name or key)
        path.mkdir()
        for filename, width, height in sizes:
            png(path / filename, width, height)
        cases[key] = str(path)
        return path

    ordinary = folder('ordinary', [('random.png',100,100), ('wrong@9x.png',200,200), ('third.png',300,300)], "spaces ' $(`no command`)")
    (ordinary/'README.txt').write_text('untouched')
    (ordinary/'.hidden.png').write_text('untouched')
    (ordinary/'nested').mkdir()
    folder('duplicates', [('one.png',100,100), ('two.png',100,100)])
    folder('different', [('one.png',100,100), ('two.png',200,100)])
    folder('cycle', [('stop@2x.png',100,100), ('stop.png',200,200)])
    folder('fractional', [('a.png',100,100), ('b.png',150,150)])
    folder('case', [('Stop.png',100,100), ('Stop@2x.png',200,200)])
    conflict = folder('conflict', [('old.png',100,100)])
    (conflict/'stop.png').mkdir()
    broken = folder('broken', [('old.png',100,100)])
    (broken/'bad.png').write_text('bad')
    folder('rollback', [('a.png',100,100), ('b.png',200,200)])

    tests = r'''
function run() {
  var cases = CASES;
  var passed = [];
  function assert(ok, message) { if (!ok) throw Error(message); }
  function plan(folder, name) { return makePlan(folder, readImages(folder), name || 'stop'); }
  function rejects(fn, message) { var failed=false; try { fn(); } catch(e) { failed=true; } assert(failed,message); }
  executePlans(plan(cases.ordinary));
  assert(exists(cases.ordinary+'/stop.png') && exists(cases.ordinary+'/stop@2x.png') && exists(cases.ordinary+'/stop@3x.png'), 'scale outputs');
  assert(exists(cases.ordinary+'/README.txt') && exists(cases.ordinary+'/.hidden.png') && exists(cases.ordinary+'/nested'), 'unrelated files');
  assert(executePlans(plan(cases.ordinary))===0,'repeat run');
  passed.push('100/200/300 pixel images, arbitrary names, existing wrong suffix, shell quoting, skipped files, repeat run');
  rejects(function(){plan(cases.duplicates);},'duplicate should fail');
  rejects(function(){plan(cases.different);},'aspect ratio should fail');
  rejects(function(){plan(cases.conflict);},'existing folder should fail');
  rejects(function(){plan(cases.broken);},'invalid image should fail');
  rejects(function(){plan(cases.ordinary,'../bad');},'invalid name should fail');
  passed.push('duplicates, mismatched shapes, existing folder, corrupted image, invalid name rejected');
  executePlans(plan(cases.cycle));
  assert(readImages(cases.cycle)[0].name==='stop.png','cycle');
  executePlans(plan(cases.fractional)); assert(exists(cases.fractional+'/stop@1.5x.png'),'fractional');
  executePlans(plan(cases.case)); assert(readImages(cases.case)[0].name==='stop.png','case rename');
  passed.push('rename cycle, fractional scale, case-only rename');
  var rollbackPlans=plan(cases.rollback);
  var realMove=move, calls=0;
  move=function(a,b){ calls++; if(calls===4)throw Error('injected failure'); return realMove(a,b); };
  rejects(function(){executePlans(rollbackPlans);},'rollback should report failure'); move=realMove;
  assert(exists(cases.rollback+'/a.png') && exists(cases.rollback+'/b.png') && !exists(cases.rollback+'/stop.png'),'rollback restored originals');
  passed.push('failed commit restores all original names');
  return JSON.stringify(passed);
}
'''.replace('CASES', json.dumps(cases))
    testfile = base/'test.js'
    testfile.write_text((root/'rename-images.js').read_text() + '\n' + tests)
    result = subprocess.run(['/usr/bin/osascript','-l','JavaScript',str(testfile)], capture_output=True, text=True)
    print(result.stdout, result.stderr)
    if result.returncode:
        raise SystemExit(result.returncode)
    for directory in base.iterdir():
        if directory.is_dir():
            assert not list(directory.glob('.rename-images-*')), directory
    print('PASS: no staging folders left behind')
    (root/'verification.txt').write_text(result.stdout + '\nPASS: no staging folders left behind\n')
