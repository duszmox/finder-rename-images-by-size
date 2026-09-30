"""Update the shipped Automator workflow with the JavaScript source."""
from pathlib import Path
import plistlib

root = Path(__file__).resolve().parent
document = root / 'Rename Images by Size.workflow/Contents/Resources/document.wflow'
workflow = plistlib.loads(document.read_bytes())
workflow['actions'][0]['action']['ActionParameters']['source'] = (root / 'rename-images.js').read_text()
document.write_bytes(plistlib.dumps(workflow))
print('Updated Rename Images by Size.workflow')
