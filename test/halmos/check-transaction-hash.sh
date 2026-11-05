#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_dir"

build_dir=$(mktemp -d)
trap 'rm -rf -- "$build_dir"' EXIT
export FOUNDRY_CONFIG="$repo_dir/test/halmos/foundry.toml"
export FOUNDRY_OUT="$build_dir/out"
export FOUNDRY_CACHE_PATH="$build_dir/cache"

max_length=352
batch_size=32
for ((start = 0; start <= max_length; start += batch_size)); do
    end=$((start + batch_size - 1))
    if ((end > max_length)); then
        end=$max_length
    fi
    lengths=$(seq -s, "$start" "$end")
    printf 'Checking calldata lengths %s through %s\n' "$start" "$end"
    halmos --contract TransactionHashTest --function checkTransactionHash \
        --forge-build-out "$FOUNDRY_OUT" --array-lengths "txn.data={$lengths}"
done
