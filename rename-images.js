ObjC.import('Foundation');

var fm = $.NSFileManager.defaultManager;
var app = Application.currentApplication();
app.includeStandardAdditions = true;
var title = 'Rename Images by Size';

function quote(value) {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

function attributes(path) {
    var error = Ref();
    var result = fm.attributesOfItemAtPathError(path, error);
    if (!ObjC.unwrap(result)) throw Error('Cannot read ' + path);
    return ObjC.deepUnwrap(result);
}

function exists(path) {
    // Attributes also detect dangling symbolic links.
    var error = Ref();
    return !!ObjC.unwrap(fm.attributesOfItemAtPathError(path, error));
}

function move(source, destination) {
    var error = Ref();
    if (!fm.moveItemAtPathToPathError(source, destination, error)) {
        throw Error('Cannot rename ' + source + '\n' + ObjC.unwrap(error[0].localizedDescription));
    }
}

function key(name) {
    return name.normalize('NFD').toLowerCase();
}

function validateName(name) {
    name = name.trim();
    if (!name || /^[.]/.test(name) || /[\/:@\x00-\x1f\x7f]/.test(name)) {
        throw Error('Enter a base name without an extension or @ suffix. Do not use /, :, @, or a leading dot.');
    }
    return name;
}

function readImages(folder) {
    if (attributes(folder).NSFileType !== 'NSFileTypeDirectory') {
        throw Error('Select a folder in Finder.');
    }
    var error = Ref();
    var contents = fm.contentsOfDirectoryAtPathError(folder, error);
    if (!ObjC.unwrap(contents)) throw Error('Cannot read folder: ' + folder);
    var names = ObjC.deepUnwrap(contents).sort();
    var images = [];
    names.forEach(function (name) {
        if (name[0] === '.') return;
        var extension = name.match(/\.([^.]+)$/);
        if (!extension || !/^(png|jpe?g|gif|tiff?|bmp|heic|heif|heics|webp|avif|jp2|jxl|psd|ico|icns|exr|tga)$/i.test(extension[1])) return;
        var path = folder + '/' + name;
        if (attributes(path).NSFileType !== 'NSFileTypeRegular') return;
        var properties = app.doShellScript('/usr/bin/sips -g pixelWidth -g pixelHeight ' + quote(path));
        var width = properties.match(/(?:^|[\r\n])\s*pixelWidth:\s*(\d+)/);
        var height = properties.match(/(?:^|[\r\n])\s*pixelHeight:\s*(\d+)/);
        if (!width || !height || +width[1] <= 0 || +height[1] <= 0) {
            throw Error('Cannot determine pixel dimensions: ' + name);
        }
        images.push({source: path, name: name, extension: extension[1], width: +width[1], height: +height[1]});
    });
    if (!images.length) throw Error('No supported raster images in ' + folder);
    images.sort(function (a, b) { return a.width * a.height - b.width * b.height; });
    return images;
}

function makePlan(folder, images, name) {
    name = validateName(name);
    var base = images[0];
    var targets = Object.create(null);
    var sources = Object.create(null);
    images.forEach(function (image) { sources[key(image.name)] = true; });
    return images.map(function (image) {
        var scale = image.width / base.width;
        // Recognize integer scales despite a one-pixel export rounding difference.
        var integer = Math.round(scale);
        if (integer >= 1 && Math.abs(image.width - base.width * integer) <= 1 &&
            Math.abs(image.height - base.height * integer) <= 1) scale = integer;
        if (Math.abs(image.height - base.height * scale) > 1) {
            throw Error('Images must be scaled versions of the same shape.\n' + image.name + ' is ' + image.width + ' × ' + image.height + '.');
        }
        var suffix = scale === 1 ? '' : '@' + String(Number(scale.toFixed(6))) + 'x';
        var targetName = name + suffix + '.' + image.extension;
        var targetKey = key(targetName);
        if (targets[targetKey]) {
            throw Error('Two images would both become ' + targetName + '.\nKeep one image per scale and file format in this folder.');
        }
        targets[targetKey] = true;
        var destination = folder + '/' + targetName;
        if (exists(destination) && !sources[targetKey]) {
            throw Error('A file or folder already exists named ' + targetName + '.');
        }
        return {source: image.source, destination: destination, folder: folder, temporary: null, state: 'original'};
    });
}

function executePlans(plans) {
    var changed = plans.filter(function (item) { return item.source !== item.destination; });
    var temporaryFolders = Object.create(null);
    try {
        changed.forEach(function (item, index) {
            if (!temporaryFolders[item.folder]) {
                var temporaryFolder = item.folder + '/.rename-images-' + ObjC.unwrap($.NSUUID.UUID.UUIDString);
                var error = Ref();
                if (!fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(temporaryFolder, false, $.NSDictionary.dictionary, error)) {
                    throw Error('Cannot create a temporary folder in ' + item.folder);
                }
                temporaryFolders[item.folder] = temporaryFolder;
            }
            item.temporary = temporaryFolders[item.folder] + '/' + index;
            move(item.source, item.temporary);
            item.state = 'temporary';
        });
        changed.forEach(function (item) {
            move(item.temporary, item.destination);
            item.state = 'renamed';
        });
    } catch (error) {
        var failures = [];
        changed.slice().reverse().forEach(function (item) {
            if (item.state !== 'renamed') return;
            try { move(item.destination, item.temporary); item.state = 'temporary'; }
            catch (rollbackError) { failures.push(rollbackError.message); }
        });
        changed.slice().reverse().forEach(function (item) {
            if (item.state !== 'temporary') return;
            try { move(item.temporary, item.source); item.state = 'original'; }
            catch (rollbackError) { failures.push(rollbackError.message); }
        });
        if (failures.length) error = Error(error.message + '\nSome files could not be restored. Check these locations:\n' + failures.join('\n'));
        throw error;
    } finally {
        // Remove empty staging folders only. Never delete files left after a failed rollback.
        Object.keys(temporaryFolders).forEach(function (folder) {
            var path = temporaryFolders[folder];
            var error = Ref();
            var children = fm.contentsOfDirectoryAtPathError(path, error);
            if (ObjC.unwrap(children) && ObjC.deepUnwrap(children).length === 0) fm.removeItemAtPathError(path, Ref());
        });
    }
    return changed.length;
}

function run(input, parameters) {
    try {
        if (!input.length) throw Error('Select a folder in Finder.');
        var plans = [];
        var seen = Object.create(null);
        for (var i = 0; i < input.length; i++) {
            var folder = ObjC.unwrap($(String(input[i])).stringByStandardizingPath);
            if (seen[folder]) continue;
            seen[folder] = true;
            var images = readImages(folder);
            var folderName = ObjC.unwrap($(folder).lastPathComponent);
            var response = app.displayDialog('New base name for images in "' + folderName + '"\n\n' +
                images.length + ' images. The smallest is ' + images[0].width + ' × ' + images[0].height +
                ' pixels and will have no suffix. Larger images get @2x, @3x, etc.\n\nEnter a name such as stop, without an extension.', {
                withTitle: title, defaultAnswer: '', buttons: ['Cancel', 'Rename'], defaultButton: 'Rename', cancelButton: 'Cancel'
            });
            plans = plans.concat(makePlan(folder, images, response.textReturned));
        }
        var count = executePlans(plans);
        app.displayNotification(count + ' image' + (count === 1 ? '' : 's') + ' renamed.', {withTitle: title});
        return input;
    } catch (error) {
        if (error.errorNumber === -128 || error.number === -128 || /User canceled/.test(error.message)) return input;
        app.displayDialog(error.message, {withTitle: title, buttons: ['OK'], defaultButton: 'OK', withIcon: 'stop'});
        return input;
    }
}
