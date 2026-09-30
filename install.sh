#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
workflow_name='Rename Images by Size.workflow'
services_dir="${1:-$HOME/Library/Services}"
destination="$services_dir/$workflow_name"

if [ "$#" -gt 1 ]; then
    printf 'Usage: %s [services-directory]\n' "$0" >&2
    exit 1
fi

mkdir -p "$services_dir"
staging_dir=$(mktemp -d "$services_dir/.rename-images-install.XXXXXX")
trap 'rm -rf "$staging_dir"' EXIT HUP INT TERM
/usr/bin/ditto "$script_dir/$workflow_name" "$staging_dir/$workflow_name"

backup_dir=''
if [ -e "$destination" ]; then
    if [ "$services_dir" = "$HOME/Library/Services" ]; then
        backup_root="$HOME/Library/Application Support/finder-rename-images-by-size/backups"
    else
        backup_root="$services_dir/.backups"
    fi
    mkdir -p "$backup_root"
    backup_dir=$(mktemp -d "$backup_root/install.XXXXXX")
    mv "$destination" "$backup_dir/$workflow_name"
    printf 'Previous workflow backed up to %s\n' "$backup_dir/$workflow_name"
fi

if ! mv "$staging_dir/$workflow_name" "$destination"; then
    if [ -n "$backup_dir" ]; then
        mv "$backup_dir/$workflow_name" "$destination"
    fi
    exit 1
fi

if [ "$services_dir" = "$HOME/Library/Services" ]; then
    /System/Library/CoreServices/pbs -update
fi
printf 'Installed %s\n' "$destination"
