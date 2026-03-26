# NatsuFox Root-Domain SEO Rollout Record

Date: 2026-03-25
Repository: `NatsuFox.github.io`
Primary domain: `https://natsufox.github.io/`
Related project repos: `Tapestry`, `A-Stockit`

## Purpose

This document records the full root-domain SEO rollout, including:

- why the work was moved from project-only thinking into a host-level domain strategy,
- what was implemented in the root-domain repository,
- what operational issues came up during publishing,
- how Git identity and Search Console verification were corrected,
- what should be improved next.

The goal is to preserve the reasoning and actions in a repo-local artifact so future SEO and site-architecture work can continue without needing the original chat transcript.

## High-Level Outcome

The root domain was turned into a lightweight static project hub that does four technical jobs:

1. establish the host-level crawl and indexing surface for `natsufox.github.io`,
2. capture broader root-domain and category-level search traffic,
3. route visitors into the right project based on intent rather than repo names alone,
4. provide durable, indexable guide pages for the currently featured public projects.

At the end of the rollout:

- the root site was implemented and pushed to `main`,
- host-level `robots.txt` and `sitemap.xml` were live in the root repo,
- project guide pages existed for `Tapestry` and `A-Stockit`,
- Google Search Console verification for the root URL-prefix property passed,
- the pushed commit history was rewritten so GitHub attributes the work to the `NatsuFox` account rather than the workspace default account.

## Strategic Context and Decisions

### 1. Why the root domain repo was needed

A project site like `https://natsufox.github.io/Tapestry/` can have good page-level metadata, but host-level crawl behavior for the shared `github.io` host is controlled from the root host, not from the project path.

That led to the decision to use a root-domain repo (`NatsuFox.github.io`) as the host-level control plane for:

- root `robots.txt`,
- root `sitemap.xml`,
- root-domain landing and routing behavior,
- broad discovery and cross-project navigation.

### 2. Hybrid model chosen

A hybrid model was recommended and implemented conceptually:

- the root-domain repo owns host-level SEO, crawl control, and project routing,
- individual project repos continue to own their own deep product pages and implementation-specific landing surfaces.

This avoids centralizing every project site into one repo while still giving the domain a coherent root strategy.

### 3. Root-domain role definition

The root domain should not duplicate full project landing pages.

Its role is:

- explain the portfolio at a high level,
- route traffic by user problem and use case,
- create indexable entry points that can rank for broader terms than the repository names,
- push qualified users into the correct repo or project page.

### 4. Current project scope

The root hub was scoped to the two public repositories visible on the account during the rollout:

- `Tapestry`
- `A-Stockit`

The hub was intentionally not inflated with speculative or non-public project entries.

## Initial Project-Level SEO Work That Informed This Repo

Before the root-domain work, there was a project-level SEO pass on the `Tapestry` landing page. That surfaced several useful patterns and one major limitation.

### What was added on the Tapestry landing page

The Tapestry landing page got:

- a stronger title and description,
- canonical URL,
- `meta robots`,
- Open Graph metadata,
- Twitter card metadata,
- JSON-LD structured data,
- a real `h1`,
- `sitemap.xml`,
- `robots.txt`.

### The important limitation discovered

For a project site under `https://natsufox.github.io/Tapestry/`, the project-level `robots.txt` is not the authoritative host-level robots file for the `github.io` host.

That drove the transition toward the root-domain repo as the technical SEO anchor.

## Repository Implementation Summary

### Core pages

The following pages were created in the root repo:

- `index.html`
- `projects/tapestry/index.html`
- `projects/a-stockit/index.html`
- `404.html`

### Shared assets and runtime files

Shared static site files were added:

- `styles.css`
- `app.js`
- `site.webmanifest`
- `.nojekyll`
- `.gitignore`

### Crawl and indexing files

Host-level SEO files were added:

- `robots.txt`
- `sitemap.xml`
- `googlecd228347c7ec0eec.html`

### Data and scripts

A small registry and generation pipeline were added:

- `data/projects.json`
- `scripts/build_site_meta.py`
- `scripts/generate_social_cards.py`

### Social and icon assets

The repo includes both iconography and social previews:

- `assets/favicon.svg`
- `assets/social-root.png`
- `assets/social-tapestry.png`
- `assets/social-astockit.png`
- `assets/social-root.svg`
- `assets/social-tapestry.svg`
- `assets/social-astockit.svg`

## Detailed Implementation Notes

### Root homepage

The root homepage was designed as a project hub rather than a portfolio vanity page.

Key technical features:

- canonical URL set to `https://natsufox.github.io/`
- `meta robots` set for indexing and full snippet/image previews
- Open Graph and Twitter metadata
- JSON-LD for `WebSite`, `Person`, `CollectionPage`, and `ItemList`
- intent-first copy focused on routing rather than generic branding
- searchable featured project cards
- use-case routing section that maps needs to projects
- FAQ section for common routing questions

### Project guide pages

Each project guide page is an indexable routing page, not a duplicate of the project repo README.

#### Tapestry guide page

Purpose:

- explain when Tapestry is the right project,
- route to the live project site and repo,
- capture discovery terms around web knowledge systems and AI-native content workflows.

Structured data included:

- `WebPage`
- `SoftwareSourceCode`
- `BreadcrumbList`
- `FAQPage`

#### A-Stockit guide page

Purpose:

- explain when A-Stockit is the right project,
- route to the repo,
- capture search terms related to A-share research workflows and AI-native market analysis.

Structured data included:

- `WebPage`
- `SoftwareSourceCode`
- `BreadcrumbList`
- `FAQPage`

### Project registry and sitemap generation

The root repo uses `data/projects.json` as a simple registry for featured projects.

That registry currently stores for each project:

- slug
- name and title
- tagline
- summary
- category
- repo URL
- live URL if available
- root-domain guide page URL
- keywords
- target audience
- user needs

`build_site_meta.py` uses this registry to generate the root sitemap, so future additions do not require hand-editing XML.

### Social preview pipeline

A small image-generation script was added so social previews are not dependent on SVG-only behavior.

`generate_social_cards.py` produces PNG cards for:

- the root domain,
- the Tapestry guide page,
- the A-Stockit guide page.

The HTML metadata was then updated to point at the PNG versions to maximize social compatibility.

### Search and routing behavior

A lightweight `app.js` file provides:

- card filtering via search input,
- filter-chip quick search shortcuts,
- automatic current year insertion in the footer.

The runtime is intentionally minimal and static-host friendly.

## Root-Domain SEO Strategy That Was Agreed

The agreed root-domain SEO strategy was:

### Root-domain responsibilities

- host-level crawl control
- root-domain sitemap management
- broad, category-level discovery capture
- cross-project routing
- project guide pages for public repos

### Project-repo responsibilities

- deep product or workflow-specific landing pages
- implementation docs
- release notes
- product-specific screenshots and demos
- repo conversion surfaces such as stars, issues, and contribution paths

## Search Console and Verification Decisions

### Property type

A `URL-prefix` property for `https://natsufox.github.io/` was the correct Search Console choice.

A `Domain property` was not the recommended path for a `github.io` host because DNS-level control is not the normal operating model there.

### Verification method

The root repo used an HTML verification file at repo root.

File:

- `googlecd228347c7ec0eec.html`

This method was chosen because it is simple, static-host friendly, and easy to keep stable in a GitHub Pages root repo.

### Verification result

Search Console verification succeeded after the verification file was committed and pushed.

### Important retention decision

The verification file should be kept in the repo unless another verification method is added and confirmed active first.

Reason:

- removing the HTML verification file can cause loss of Search Console verification for the property.

## Git Identity and Publishing Issues Encountered

### Problem discovered

The root repo initially inherited the global workspace Git identity:

- name: `GQH123`
- email: `572694553@qq.com`

As a result, the first pushed commits were attributed to the wrong account.

### Correct repo-local Git configuration applied

The repo was then configured locally to use the correct project-scoped identity:

- `user.name = NatsuFox`
- `user.email = 268350328+NatsuFox@users.noreply.github.com`
- `remote.origin.url = https://NatsuFox@github.com/NatsuFox/NatsuFox.github.io.git`
- repo-local credential helper and `credential.usehttppath = true`

### Why this mattered

The Tapestry repo was already using repo-local `NatsuFox` configuration while the workspace global defaults still pointed to `GQH123`.

The root repo needed the same project-scoped override so future commits and pushes would not leak the workspace default identity.

### Rewrite and republish sequence

The original two commits were rewritten in place so both `author` and `committer` became:

- `NatsuFox <268350328+NatsuFox@users.noreply.github.com>`

During force-push, a stale remote-tracking situation appeared because the GitHub repo had been recreated clean. The safe recovery path was:

1. confirm the remote branch state,
2. prune stale tracking refs,
3. push the rewritten `main` branch as a new branch rather than clobbering unknown remote history.

That completed successfully.

## Final Commit History in the Root Repo

The final root-domain commit sequence at the end of this rollout is:

- `34001e4` `feat(site): add root-domain project hub`
- `ea4c124` `chore(seo): add root-domain crawl metadata tooling`
- `5606af1` `chore(seo): add Google Search Console verification file`

## Verification Performed

### Local static-serving checks

The site was repeatedly served locally via `python3 -m http.server` against the repo output.

Successful checks included:

- `/`
- `/robots.txt`
- `/sitemap.xml`
- `/projects/tapestry/`
- `/projects/a-stockit/`
- social preview PNG assets

### HTML signal checks

The served HTML was verified to include:

- `h1` elements on the root page and project guide pages
- canonical links
- `meta robots`
- Open Graph tags
- Twitter card tags
- JSON-LD blocks

### Sitemap checks

The generated sitemap was verified to include:

- `https://natsufox.github.io/`
- `https://natsufox.github.io/projects/tapestry/`
- `https://natsufox.github.io/projects/a-stockit/`

### Search Console check

The root-domain HTML verification file was pushed and the root property verification passed.

## GitHub Repo Metadata Follow-Up

The GitHub repo About text and homepage were also discussed and updated manually by the user.

Recommended About posture for the root repo:

- description should describe the root-domain hub rather than a single product,
- homepage should point to `https://natsufox.github.io/`.

## Current Strengths of the Root-Domain Setup

### 1. Technical crawl control is centralized

The root repo now owns the host-level robots and sitemap surface for `natsufox.github.io`.

### 2. Search intent is clearer than on a raw GitHub profile

Instead of sending all traffic to GitHub directly, the root site explains the project portfolio and routes visitors to the right destination.

### 3. The setup is scalable

The combination of `data/projects.json` and `build_site_meta.py` makes future growth straightforward.

### 4. Search Console is wired early

Verification and sitemap submission can now happen against the proper root-domain property.

## Remaining Limitations

### 1. The project registry is still small

Only two public projects are currently represented. The root hub becomes more valuable as more real public projects are added.

### 2. Copy positioning can still be sharpened

There is still room to tighten the exact phrases the root domain should rank for, especially around:

- AI-native agent tools
- web knowledge workflows
- AI-native research systems
- A-share market workflows

### 3. Search Console verification currently depends on the HTML file

This is acceptable, but it means the verification file should not be casually deleted.

### 4. There is no analytics instrumentation yet

The current rollout focused on indexing, routing, and architecture, not analytics or event measurement.

## Recommended Next SEO Improvements

### High-priority

1. Refine the root homepage title, `h1`, and intro copy around the exact root-domain keywords you want to own.
2. Submit the root sitemap in Search Console if not already submitted.
3. Inspect and request indexing for:
   - homepage
   - Tapestry guide page
   - A-Stockit guide page
4. Monitor impressions and CTR in Search Console before doing a larger copy rewrite.

### Medium-priority

1. Expand the root hub to include more public project guide pages as they become ready.
2. Add one small README or contributor note explaining how to add a new project to `data/projects.json` and regenerate the sitemap/social assets.
3. Consider adding a small `news` or `latest updates` section if the root domain should capture freshness-related queries.

### Longer-term

1. If a custom domain is introduced later, update:
   - canonical URLs
   - sitemap URLs
   - Open Graph URLs
   - Search Console property
2. Add analytics only after the routing surface stabilizes.
3. Consider structured comparison or category pages if the project portfolio grows enough to justify them.

## Operational Checklist for Future Updates

When adding a new project to the root hub:

1. Add a new entry to `data/projects.json`.
2. Create a corresponding guide page under `projects/<slug>/index.html`.
3. Update or generate the relevant social card asset.
4. Run:
   - `python3 scripts/build_site_meta.py`
   - `python3 scripts/generate_social_cards.py`
5. Serve the repo locally and check:
   - page loads
   - canonical URL
   - JSON-LD presence
   - sitemap entry
6. Commit and push.
7. Inspect the new guide page in Search Console and request indexing if needed.

## Minimal Recovery Checklist If Attribution Goes Wrong Again

If the wrong GitHub account shows up as contributor again:

1. Check `git log --format=fuller -2` to see the actual author/committer identity.
2. Check `git config --local --list --show-origin` in the repo.
3. Confirm the repo-local `user.name`, `user.email`, remote URL, and credential settings.
4. If bad commits were already made, rewrite them before pushing further.
5. If the repo was recreated or remote history changed, prune stale remote refs before re-pushing.

## Closing Notes

This rollout established the root domain as a real technical SEO asset rather than a passive redirect surface.

The most important durable results are:

- host-level crawl control now exists in the correct repo,
- project discovery is routed by intent,
- Search Console is connected to the right property,
- the Git identity issue that could have polluted contributor attribution was corrected and documented.

This document should be updated when the root hub expands, when a custom domain is introduced, or when the next major SEO refinement pass begins.
