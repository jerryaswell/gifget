# Project guidance for Claude Code

## Node.js version — use Node 24

Node 20 is deprecated on GitHub Actions runners. `.nvmrc`, `package.json` `engines` and any new
tooling stay on Node 24. Never add Node 20.

## GitHub Actions — pin to commit SHAs

Actions are pinned to a full commit SHA with the version in a trailing comment:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A tag can be moved by whoever owns it. A SHA cannot. Dependabot (`.github/dependabot.yml`) moves
the SHA and the comment together. Never replace a SHA with a bare tag.

## The pipeline's rules

Keep the rules in README.md, "How a GIF gets made": low resolution, a small palette, a dark ground,
an endless loop, and quantize last. Any randomness must come from the seeded `rng`, never from
`Math.random`. The effects unit tests enforce all of this for every look.

## Authorship — no Claude attribution

Every commit is authored and committed by Jerry Caskey <jerryaswell@users.noreply.github.com>.
Nothing written to this repository or to GitHub carries Claude attribution: no `Co-Authored-By`
trailer, no `Claude-Session` link, no "Generated with Claude Code" footer. `.claude/settings.json`
enforces the commit and PR parts.
