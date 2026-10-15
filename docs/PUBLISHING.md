# Publishing

How `@jpeakai/mermaidjs-lint` gets to npm.
Every release after the first goes through the Publish workflow in GitHub Actions, with no npm token anywhere.
Releases are the only way a version reaches npm, and the workflow publishes with provenance.

## Speed run

Use this for every release once the one-time setup below is done.
The version bump lands through a pull request like any other change.
Before the commit, rename the `Unreleased` heading in `CHANGELOG.md` to the new version and date, and add an empty `Unreleased` above it.

```sh
git switch main && git pull
make ci                                  # the full local gate, including the decision bundle
npm version patch --no-git-tag-version   # or minor, major, or prerelease --preid=rc
VERSION=$(node -p "require('./package.json').version")
git switch -c "release-v$VERSION"
"${EDITOR:-vi}" CHANGELOG.md             # move the Unreleased entries under the new version
git commit -am "Release v$VERSION"
git push -u origin "release-v$VERSION"
gh pr create --fill
gh pr checks --watch                     # wait for both CI checks to pass
gh pr merge --merge
git switch main && git pull              # confirm the bump is on main
gh workflow run publish.yml --ref main
gh run watch "$(gh run list --workflow=publish.yml --limit 1 --json databaseId -q '.[0].databaseId')"
npm view @jpeakai/mermaidjs-lint version    # confirm the new version is live
```

The workflow creates the tag and the GitHub release itself, so never tag by hand.
A run started from any branch but main fails before it creates anything.
A version containing `alpha`, `beta` or `rc` publishes under that npm dist-tag and is marked a prerelease.

## What the workflow does

1. `prepare` refuses a run not started from `main`, then reads the version from `package.json` on `main` and pins that commit.
2. It stops if the tag, the GitHub release or the npm version already exists.
3. It creates a draft GitHub release with generated notes.
4. `publish-npm` runs in the `npm` environment, checks out the pinned commit and runs `npm publish --provenance`.
5. npm runs `prepublishOnly`, which is `make check`, then `prepack`, which is `make build`.
6. `finalize-release` flips the draft to published once npm has accepted the package.

## One-time setup

These steps were needed once, for the first version.
They are kept so the next package in this org can repeat them.

### 1. Create the npm org

Create the `jpeakai` organisation on npmjs.com.
The free plan allows unlimited public packages.

### 2. Publish the first version by hand

npm attaches a trusted publisher to a package that already exists, so the first version is uploaded from a laptop.

```sh
npm login                      # opens the browser, and 2FA is required
npm whoami                     # confirm the account is a member of jpeakai
make ci                        # the full local gate
npm publish --access public    # runs make check and make build first
```

A local publish cannot carry provenance, and that is expected for this one version.

### 3. Record the release on GitHub

The workflow did not create this version, so tag it to match what later runs produce.

```sh
gh release create "v$(node -p "require('./package.json').version")" --target main --generate-notes
```

### 4. Protect main

Require a pull request and both CI checks for every change to main, with no exception for admins.
No approval is required, since a single maintainer cannot approve their own pull request.

```sh
gh api -X PUT repos/jpeakai/jpai-mermaidjs-lint/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": {"strict": true, "contexts": ["Check (Node 20)", "Check (Node 24)"]},
  "enforce_admins": true,
  "required_pull_request_reviews": {"required_approving_review_count": 0},
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
gh api -X PATCH repos/jpeakai/jpai-mermaidjs-lint -F allow_auto_merge=true
```

The check names must match the CI job names exactly, including the Node version.

### 5. Create the npm environment

The `npm` environment admits only main, so GitHub refuses the publish job on any other branch.

```sh
gh api -X PUT repos/jpeakai/jpai-mermaidjs-lint/environments/npm \
  -F "deployment_branch_policy[protected_branches]=false" \
  -F "deployment_branch_policy[custom_branch_policies]=true"
gh api -X POST repos/jpeakai/jpai-mermaidjs-lint/environments/npm/deployment-branch-policies \
  -f name=main -f type=branch
```

### 6. Add the trusted publisher

Trusted publishing is an OIDC relationship between npm and one GitHub workflow.
It can only be added once the package exists, which is why step 2 publishes by hand.

1. Sign in to npmjs.com as a member of the `jpeakai` org.
2. Open the package access page: <https://www.npmjs.com/package/@jpeakai/mermaidjs-lint/access>.
3. Under Trusted Publisher, choose GitHub Actions.
4. Fill in the fields from the table below and save.

| Field | Value |
|---|---|
| Organization or user | `jpeakai` |
| Repository | `jpai-mermaidjs-lint` |
| Workflow filename | `publish.yml` |
| Environment | `npm` |

The workflow filename is only the file name, never the `.github/workflows/` path.
The environment must match the `environment:` of the `publish-npm` job, or npm rejects the upload.
For another package, swap `@jpeakai/mermaidjs-lint` in the url for its name.

### 7. Lock publishing to the workflow

On the same access page, open Publishing access.
Choose the option that requires two-factor authentication and disallows tokens.
From then on only the workflow can publish, and a leaked token cannot.

### 8. Prove it

Bump to the next patch version and run the speed run above.
The package page on npmjs.com should show a provenance badge that links to the workflow run.

## When it fails

| Symptom | Cause and fix |
|---|---|
| `Release vX already exists` | Bump the version in `package.json`, or delete the release with `gh release delete vX --cleanup-tag --yes`. |
| `Tag vX exists with no release` | An earlier run pushed the tag but never made the release. Delete the remote tag with `git push origin :refs/tags/vX`, then run again. |
| `already on npm` | npm never lets a version be reused, even after an unpublish, so bump the version. |
| `Releases run only from main` | The run started from another branch. Merge the change first, then run it with `--ref main`. |
| `Branch is not allowed to deploy to npm` | The `npm` environment refused a branch other than main, which is the protection working. |
| `Protected branch update failed` on push | Main takes changes only through a pull request, so push a branch and open one. |
| `E404` or `ENEEDAUTH` on publish | The trusted publisher does not match: check the repository name, that the workflow filename is exactly `publish.yml`, and that the environment is `npm`. |
| `E403` on publish | The npm account or the trusted publisher has no rights in the `jpeakai` org. |
| Provenance error | The repository must be public, and the job needs `id-token: write`. |
| `make check` fails in the publish job | The same failure shows in the CI workflow, so fix it on `main` first. |
| A draft release is left behind | The npm step failed after `prepare`. Delete the draft with `gh release delete vX --cleanup-tag --yes`, fix the cause, and run again. |

## Why the gates differ

`make ci` also regenerates the decision bundle and applies the biome autofix, which a gate must never do.
CI and `prepublishOnly` therefore run `make check`, which only checks.
Run `make ci` locally before every release, and commit any file it regenerates, since no other gate notices a stale bundle.
