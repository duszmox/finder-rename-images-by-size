# Rename Images by Size

A macOS Finder Quick Action that renames the images in a folder using a new base name and scale suffixes calculated from their pixel dimensions.

For example, enter `stop` for three images with these dimensions:

| Dimensions | Original filename | New filename |
| --- | --- | --- |
| 100 × 100 | `first.png` | `stop.png` |
| 200 × 200 | `another.png` | `stop@2x.png` |
| 300 × 300 | `image@wrong.png` | `stop@3x.png` |

The smallest image in each folder is the 1x image. Existing filenames and suffixes do not affect the scale. Fractional scales produce names such as `stop@1.5x.png`.

## Install

Download this repository with **Code → Download ZIP**, extract it, and run `install.sh` from the extracted directory:

```sh
./install.sh
```

Or clone and install:

```sh
git clone https://github.com/duszmox/finder-rename-images-by-size.git
cd finder-rename-images-by-size
./install.sh
```

The installer copies the included workflow to `~/Library/Services`. If an older copy exists, it backs it up before replacing it. Installation and everyday use require only built-in macOS tools.

## Use

1. Right-click a folder in Finder.
2. Choose **Quick Actions → Rename Images by Size**.
3. Enter a base name, such as `stop`, without an extension or `@` suffix.

You can select multiple folders. Each folder gets its own prompt and its own smallest-image reference. Canceling any prompt leaves all selected folders unchanged.

If the action is hidden, enable it in Finder's extensions settings. See [Apple's Quick Actions guide](https://support.apple.com/en-hk/guide/automator/aut73234890a/2.10/mac/15.0).

## Behavior

- Uses pixel dimensions, rather than file size in bytes.
- Preserves file extensions. Supports common raster formats, including PNG, JPEG, TIFF, GIF, WebP, HEIC, and AVIF, when macOS can read them.
- Processes images directly inside the selected folder. Skips hidden files, symbolic links, non-image files, and subfolders.
- Requires matching image proportions, allowing one pixel of export rounding.
- Rejects duplicate output names and occupied destinations. No existing file is overwritten.
- Finishes all prompts and validation before renaming. If a move fails, it attempts to restore the original names and reports any files it cannot restore.

## Source and verification

`rename-images.js` is the JavaScript for Automation source embedded in `Rename Images by Size.workflow`. Open the workflow in Automator to inspect or edit the action.

After editing the JavaScript source, update the packaged workflow and run the integration checks:

```sh
python3 build-workflow.py
python3 verify.py
```

Python 3 is needed only for development. The tests create disposable PNG images and exercise the actual JXA and `sips` tools, including scale detection, unusual filenames, collisions, repeated runs, and rollback after an injected failure. The packaged workflow was also tested with the Automator command-line runner on macOS 27.

## Uninstall

Remove `~/Library/Services/Rename Images by Size.workflow`.
