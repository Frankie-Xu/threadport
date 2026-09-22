# ThreadPort UI inspiration notes

Date: 2026-09-22

The references below were inspected as public repositories. They are used as
layout and interaction references only; ThreadPort keeps its own local-first
product language, copy, and data contracts.

## 0. Mature visual references for the second pass

- Apple Human Interface Guidelines, Materials: https://developer.apple.com/design/human-interface-guidelines/materials
  - Liquid Glass is treated as a functional layer for sidebars, toolbars,
    popovers, and navigation. Apple recommends keeping the content layer
    calmer and using glass sparingly so text remains legible.
- Apple Newsroom, Liquid Glass overview: https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
  - The material adapts to context and gives depth without turning every
    content block into a decorative surface.
- Raycast, A fresh look and feel: https://www.raycast.com/blog/a-fresh-look-and-feel
  - Search is the center of the product, and the action bar exposes the next
    useful operation without adding visual clutter.
- Linear, A calmer interface for a product in motion: https://linear.app/now/behind-the-latest-design-refresh
  - Compact headers, predictable action placement, and restrained density make
    a sophisticated tool feel deliberate rather than generated.

Second-pass ThreadPort rule: use glass for the sticky navigation, command bar,
workspace selector, and hero action layer; use calm, opaque or near-opaque
surfaces with hairline separators for metrics, activity, and project content.

## 1. Raycast / ray.so

- Repository: https://github.com/raycast/ray-so
- Open locally: `git clone https://github.com/raycast/ray-so.git && cd ray-so && npm install && npm run dev`
- What to study: the project groups several focused tools (code images, icon
  maker, prompts, themes, snippets, and quicklinks) behind a compact navigation
  model. Its interface language favors fast search, keyboard-first actions,
  preview/detail surfaces, and small semantic icons.
- ThreadPort takeaway: use an icon rail plus a command search field; make task
  rows and primary actions keyboard reachable; reserve glow for the current
  state rather than decorating every surface.

## 2. Cal.com / cal.diy

- Repository: https://github.com/calcom/cal.diy
- Open locally: `git clone https://github.com/calcom/cal.diy.git && cd cal.diy && yarn && yarn dev`
- What to study: a restrained product shell, a clear primary action, dense but
  readable scheduling surfaces, and a strong separation between navigation,
  context controls, and the main work area.
- ThreadPort takeaway: keep the top command bar stable while the workspace
  content changes; use one obvious “Open task” action and a quieter “New task”
  alternative.

## 3. Twenty CRM

- Repository: https://github.com/twentyhq/twenty
- Open locally: `git clone https://github.com/twentyhq/twenty.git && cd twenty && yarn`
  (the repository documents Docker Compose for self-hosting and Nx commands for
  local packages).
- What to study: persistent workspace navigation, contextual lists, timeline
  records, keyboard search, and an icon system that maps directly to objects
  and actions. Its docs also keep navigation groups and icons in a single
  structure.
- ThreadPort takeaway: show recent task activity as a timeline-like list and
  use project rows as a compact drill-down surface instead of adding more
  generic cards.

## 4. Appwrite Console

- Repository: https://github.com/appwrite/console
- Open locally: `git clone https://github.com/appwrite/console.git appwrite-console && cd appwrite-console && bun install && bun dev`
- What to study: consistent UI primitives across pages, selective color use,
  explicit workflow guidance, and accessibility as part of the console’s
  visual system.
- ThreadPort takeaway: use one shared token system for panels, controls,
  status colors, and focus rings; pair visual status with readable text and
  preserve recovery actions in the existing routes.

## Applied ThreadPort direction

The redesign combines those references into a local command-center surface:

- Dark graphite ground with a restrained blue accent and softened contrast;
  large rainbow gradients and ornamental neon have been removed.
- A translucent, blurred sidebar and command bar establish the functional
  glass layer while the content panels stay calm and readable.
- System typography follows the Apple/PingFang stack with a smaller display
  scale, tighter title tracking, more breathable body leading, and tabular
  numbers for metrics.
- The hero's orbit is now a quiet stacked context tile, keeping depth and a
  focal visual without looking like an AI-generated sci-fi illustration.
- Metrics sit in one unified surface with hairline separators; activity and
  project rows share the same surface grammar and use color only for status.
- Existing task, history, settings, and create flows remain the source of
  truth. No fake totals, remote assets, or runtime UI dependency were added.
