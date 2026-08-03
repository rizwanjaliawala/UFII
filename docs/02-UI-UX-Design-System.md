# 02 - UI / UX Design System

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

This document defines the complete design language for the TMS.

Every page, component and interaction must follow these guidelines.

The application should look and feel like enterprise software built by companies such as:

- Oracle
- SAP
- Uber Freight
- project44
- FourKites
- Trimble

Avoid designs that resemble generic dashboards or AI-generated templates.

---

# Design Principles

The interface must be:

- Professional
- Minimal
- Clean
- Data-focused
- Fast
- Modern
- Easy to scan
- Consistent

Every screen should communicate trust and operational efficiency.

---

# Welcome & Enterprise Startup Experience

## Purpose

The TMS should provide a premium enterprise startup experience comparable to Oracle Transportation Management, SAP TM, Microsoft Dynamics, Uber Freight, FourKites and project44.

The welcome screen should reassure users that the system is initializing correctly while background services are preparing operational data.

This is not a decorative splash screen — it is a functional **System Initialization Dashboard**.

---

## Display Conditions

Display the Welcome Screen when:

- User launches the application
- Browser is refreshed
- User logs in
- Application is restarted
- Administrator performs a complete system restart

Do not display it during normal page navigation.

---

## Display Duration

Minimum Display Time

```
800 milliseconds
```

Maximum Display Time

```
3 seconds
```

If initialization completes quickly, keep the animation visible for at least 800ms to avoid flashing.

If initialization requires more time, continue showing real system progress until complete.

---

## Branding

Display

```
Utopia Fulfillment Inc.

Transportation Management System

Enterprise Edition
```

Display application version in the lower corner.

```
Version 1.0.0
```

---

## Visual Theme

The startup screen should reflect the company's logistics industry.

Background should include a premium animated logistics environment.

- Modern shipping port
- Container yard
- RTG cranes
- Gantry cranes
- Shipping containers
- Tractor trucks
- Container chassis
- Cargo vessels
- Warehouse skyline

The animation should be elegant and subtle.

Never cartoonish.

---

## Animation Style

Use Framer Motion.

Animations should include

- Smooth fades
- Slow parallax movement
- Floating light effects
- Animated logo reveal
- Soft scaling
- Gentle camera movement
- Animated loading indicators

Target

```
60 FPS
```

Avoid excessive motion.

---

## Company Logo Animation

Everything appears sequentially:

```
Logo
↓
Company Name
↓
System Name
↓
Status Panel
↓
Progress Bar
↓
Initialization Messages
```

---

## Dynamic Loading Messages

Rotate messages while loading.

```
Initializing Enterprise Platform...
Loading Configuration...
Loading Dashboard...
Loading Container Database...
Reading Operational Data...
Synchronizing TMS Master...
Connecting Google Sheets...
Loading Google Drive...
Checking Outlook...
Initializing AI Agents...
Preparing Cost Analysis...
Building Dashboard...
Loading Vendor Analytics...
Preparing Reports...
Finalizing Startup...
Ready.
```

Messages should reflect actual initialization stages whenever possible.

---

## Startup Health Check

Display a live status panel.

```
System Status

✓ Google Source Sheet 1
✓ Google Source Sheet 2
✓ Google Drive
✓ Outlook Desktop
✓ TMS Master
✓ Synchronization Engine
✓ AI Engine
✓ Cost Analysis Engine
✓ Reports Module
✓ Dashboard
✓ Security Services
```

Each service should display one of

```
Waiting · Connecting · Ready · Warning · Failed
```

with corresponding icons and colors.

---

## Initialization Pipeline

```
Load Environment
↓
Load Configuration
↓
Initialize Application
↓
Read Source Google Sheet 1
↓
Read Source Google Sheet 2
↓
Connect Google Drive
↓
Initialize Outlook Desktop Service
↓
Initialize Synchronization Engine
↓
Load TMS Master
↓
Initialize AI Agents
↓
Initialize Cost Analysis
↓
Load Dashboard
↓
Ready
```

---

## Progress Indicator

Use a premium animated progress bar.

- Smooth animation
- Gradient fill
- Percentage (optional)
- Current loading stage
- Estimated completion (future)

Avoid generic browser loaders.

---

## Startup Statistics

Optionally display, updating live while loading:

```
Containers Loaded
Invoices Loaded
Emails Indexed
Documents Linked
Vendors Loaded
AI Agents Started
```

---

## Transition to Dashboard

```
Fade Splash
↓
Logo Scale Down
↓
Sidebar Slide In
↓
Top Navigation Fade
↓
Dashboard Cards Animate
↓
Charts Animate
↓
Tables Fade
↓
Ready
```

Transitions should feel seamless.

---

## Refresh Experience

When the user clicks **Refresh Data**, do **not** show the full splash screen.

Show a compact synchronization overlay:

```
Refreshing Operational Data...
Reading Source Sheets...
Processing Outlook...
Updating TMS Master...
Running AI Analysis...
Refreshing Dashboard...
```

Allow users to continue working where possible.

---

## Error Handling

If initialization fails, display

```
Unable to Complete Startup
```

Show

- Failed Service
- Error Description
- Retry Button
- Continue Offline (if possible)
- Contact Administrator

Never leave users on an endless loading screen.

---

## Offline Mode

If Google services are temporarily unavailable, allow startup using the latest synchronized TMS Master data.

```
Offline Mode

Displaying Last Available Data

Last Successful Synchronization:
<Date & Time>
```

Automatically retry synchronization in the background.

---

## Performance Requirements

Startup should

- Never freeze the interface
- Never block animations
- Use GPU-accelerated rendering
- Load services asynchronously
- Perform non-critical initialization after the dashboard loads

---

## Accessibility

Support

- Reduced Motion Mode
- Keyboard Navigation
- Screen Readers
- High Contrast Mode
- Proper ARIA Labels

If reduced-motion is enabled, replace animations with simple fades.

---

## Future Enhancements

Design the startup architecture to support, without redesign:

- Company announcements
- Maintenance notices
- Release notes
- Daily operational statistics
- Weather alerts
- Port congestion alerts
- AI operational summary
- Live system diagnostics

---

## Claude Code Instructions

Build the startup experience as a reusable component.

- Use Framer Motion.
- Keep animations subtle and professional.
- Display real initialization progress whenever possible.
- **Never fake loading delays.**
- Use asynchronous initialization.
- Keep startup independent of business logic.
- Ensure excellent responsiveness on desktop, tablet and mobile.
- Maintain enterprise-grade visual quality.

---

## Success Criteria

Within a few seconds the user should know:

- The application is healthy.
- All integrations are working.
- Operational data is loading successfully.
- AI services are available.
- The dashboard is ready.

---

## Implementation Notes

Added during Phase 1 — these reconcile the section above with the rest of this document.

**Real progress, never theatre.** The 13 pipeline stages map to actual initialization calls, each reporting completion to a `useInitialization` hook. Startup statistics count real loaded records. Where a stage cannot be measured it advances on its underlying promise resolving, never on a timer. No fake percentage.

**Non-blocking, and never a dead end.** Initialization starts on mount; the screen is a presentation layer over it. A failing Google or Outlook check degrades that service to `Warning`/`Failed` in the health panel and offers **Continue Offline** against the last synchronized TMS Master data — it must never hold the user (doc 10 §Disaster Recovery).

**Timing.** Minimum 800ms enforced by holding the exit until elapsed ≥ 800ms. The 3s figure is a *soft* cap for the happy path; per this spec, genuinely slow initialization keeps showing real progress rather than dismissing early into an empty dashboard.

**Motion budget.** This document caps animation at 300ms elsewhere and forbids visual clutter. The startup screen deliberately exceeds that budget, and only here — it is an initialization surface, not a data surface. All movement is `transform`/`opacity` only, for GPU compositing and the 60 FPS target.

**Scope of the port scene.** The animated logistics background is a shared component used at low opacity behind the startup screen and the login screen **only**. It must never appear behind operational data (§Design Rules).

**Refresh is a different component.** The compact synchronization overlay is separate from the startup screen and non-modal, so work continues underneath. It is also what a large manual sync uses — the full startup screen is never re-shown for a refresh.

**Reduced motion.** `prefers-reduced-motion` holds a static composition; stages still progress as text, and the health panel still updates.

---

# Theme

> **Revised 2026-07-26 (client direction).** The theme is a **warm glassmorphic**
> system over a photographic background. This supersedes the previous flat
> emerald direction, and supersedes the "do not use glassmorphism" rule that
> appeared under Design Rules.

## Appearance

Light, warm enterprise theme.

Background is the brand photograph (`client/public/truck-bg.jpg`), fixed and
full-bleed, behind a cream scrim. All chrome and content sit on frosted glass
surfaces above it.

Avoid dark dashboards except where explicitly required.

---

# Color Palette

| Element | Colour | Hex |
|---|---|---|
| Background | Soft Cream | `#F8F5F0` |
| Surface / Cards | Warm White | `#FFFCF8` |
| Primary Text | Charcoal | `#2F2F2F` |
| Secondary Text | Slate Gray | `#6B6B6B` |
| Primary Accent | Olive Green | `#6F7D4E` |
| Secondary Accent | Terracotta | `#C97C5D` |
| Borders | Light Beige | `#E8E1D7` |

## Primary Accent — Olive Green `#6F7D4E`

Primary buttons · active navigation · progress · KPI highlights

## Secondary Accent — Terracotta `#C97C5D`

Secondary emphasis · highlights · the "Enterprise Edition" mark · chart accents

---

## Derived colours

The supplied palette carries no interaction or status values, so these are
derived to stay in the same warm family. Status colours are deliberately
distinct from the two brand accents, so olive never has to mean both
"primary button" and "on time".

| Token | Hex | Use |
|---|---|---|
| `primary-hover` | `#5D6A41` | Olive hover |
| `primary-wash` | `#EEF0E6` | Selected rows, tinted fills |
| `accent-hover` | `#B86A4C` | Terracotta hover |
| `accent-wash` | `#F7EBE4` | Terracotta tint |
| `surface-sunk` | `#F2ECE4` | Recessed wells, table heads |
| `border-strong` | `#D6CCBE` | Emphasised borders |
| `text-disabled` | `#A09A92` | Disabled text |
| `success` | `#5B8C51` | On time, paid, healthy |
| `warning` | `#C9954D` | LFD approaching, review needed |
| `danger` | `#B24A3A` | Overdue, critical alerts, errors ONLY |
| `info` | `#5A7184` | Informational |

---

# Glass System

Two tiers, chosen by content density.

| Class | Background | Blur | Use |
|---|---|---|---|
| `.glass` | `rgba(255,252,248,0.72)` | 18px | Sidebar, header, startup panel |
| `.card` / `.glass-raised` | `rgba(255,252,248,0.85)` | 18px | Cards, widgets, panels |
| `.glass-solid` | `rgba(255,252,248,0.94)` | 10px | Tables, drawers, review queues |

**Legibility rule.** Data-dense surfaces use `.glass-solid`. A table of container
numbers read through heavy translucency is a support ticket waiting to happen —
translucency must never cost readability.

**Performance rule.** `backdrop-filter` is expensive. Apply it to a small number
of large containers (chrome, cards, drawers). Never per table row, never per
list item — that is what breaks the 60 FPS target in doc 10.

**Scrim.** The photograph sits behind a cream gradient scrim
(`0.42 → 0.62`). Raising it hides the photograph; lowering it strains text
placed directly on the background. Legibility is carried by the glass panels,
not by the scrim.

**Fallback.** Where `backdrop-filter` is unsupported, all glass surfaces resolve
to near-opaque warm white so nothing becomes unreadable.

---

# Typography

Use:

## Primary Font

Inter

Fallback

```
Arial
sans-serif
```

---

## Alternative

Geist

---

## Monospace

IBM Plex Mono

Use for:

- Container Numbers
- Booking Numbers
- Chassis Numbers
- PU Numbers

---

# Font Sizes

```
Page Title

32px

Section Title

24px

Card Title

18px

Body

14–16px

Caption

12px
```

---

# Font Weight

```
700

Titles

600

Section Headers

500

Labels

400

Body
```

---

# Layout

Maximum Width

```
1600px
```

Content Padding

```
24px
```

Card Padding

```
20px
```

Grid Gap

```
20px
```

Border Radius

```
12px
```

Never exceed

```
16px
```

---

# Shadows

Use subtle shadows only.

Example

```
0 4px 12px rgba(0,0,0,.08)
```

Avoid floating cards.

---

# Navigation

Sidebar

Width

```
280px
```

Collapsed

```
80px
```

Requirements

- Smooth expand/collapse
- Animated icons
- Active indicator
- Search
- User Profile
- Company Logo
- Notifications

---

# Header

Contains

- Search
- Refresh Data
- AI Assistant
- Notifications
- User Menu
- Settings

Sticky header.

---

# Dashboard

The dashboard is the command center.

Default widgets

- Needs Attention
- LFD Risk
- Active Containers
- Today's Appointments
- Vendor Performance
- Cost Analysis Summary
- D&D Exposure
- Recent Activity
- Notifications
- Sync Status

Widgets must be movable in future versions.

---

# Cards

Every card must include

- Title
- Icon
- Value
- Trend
- Action

Hover

Slight elevation.

---

# Tables

Enterprise quality tables.

Requirements

- Sticky header
- Sorting
- Filtering
- Search
- Pagination
- Export
- Column resize
- Zebra rows
- Hover highlight
- Keyboard navigation

Large tables should use virtualization.

---

# Forms

Requirements

- Inline validation
- Helpful errors
- Date pickers
- Searchable dropdowns
- Floating labels where appropriate

Never use browser default styling.

---

# Buttons

Types

Primary

Secondary

Outline

Ghost

Danger

Loading

Icon

Buttons must have

- Hover
- Focus
- Disabled
- Loading

States.

---

# Badges

Examples

Upcoming

Completed

Overdue

Pending

Paid

Disputed

Vendor

Terminal

SSL

Use color consistently.

---

# Modals

Animated.

Background blur.

ESC closes.

Click outside closes unless destructive action.

---

# Drawers

Slide from right.

Used for

- Container Details
- Vendor Details
- Email Summary
- Cost Details

---

# Toast Notifications

Top Right

Auto dismiss

Types

Success

Warning

Info

Error

---

# Empty States

Never display blank pages.

Show

Illustration

Explanation

Recommended Action

---

# Loading States

Every page needs

Skeleton loaders

Shimmer

Progress indicators

Fade transitions

Avoid blank screens.

---

# Error States

Friendly messages.

Retry button.

Technical details hidden.

---

# Icons

Use Lucide React.

Consistent size.

```
18px

20px

24px
```

No mixed icon libraries.

---

# Charts

Use Recharts.

Charts

- Line
- Area
- Bar
- Pie
- Heatmap
- KPI Gauge

Interactive tooltips.

---

# Animations

Use Framer Motion.

Animations must remain subtle.

Examples

Fade

Slide

Scale

Drawer

Modal

Sidebar

Cards

Page transition

Maximum duration

```
300ms
```

---

# Micro Interactions

Button Hover

Card Hover

Notification Bell

Search Focus

Sidebar Expand

Drawer Open

Accordion

Tabs

Progress Bars

---

# Search Experience

Global Search

Supports

- Container
- Vendor
- Invoice
- PU
- Booking
- Chassis
- Terminal

Results appear instantly.

---

# Container 360 UI

When clicking a container

Open right drawer.

Show

Summary

Status

Timeline

Vendor

Email Summary

Attachments

Invoices

Cost

AI Insights

Quick Actions

The transition should feel smooth and premium.

---

# Accessibility

Support

Keyboard navigation

Focus states

ARIA labels

High contrast

Readable typography

Screen readers

---

# Responsive Breakpoints

Desktop

```
1440+
```

Laptop

```
1280
```

Tablet

```
768
```

Mobile

```
480
```

Never allow broken layouts.

---

# Component Rules

Every component should be

Reusable

Typed

Documented

Accessible

Responsive

Independent

---

# Design Rules

Do NOT

- Use excessive gradients
- Use neon colors
- ~~Use glassmorphism~~ — **superseded 2026-07-26.** Glassmorphism is now the
  house style; see §Glass System for the tiers and the legibility/performance
  rules that constrain it.
- Use excessive rounded corners
- Use unnecessary animations
- Use cluttered dashboards

Prefer

- White space
- Clear hierarchy
- Enterprise aesthetics
- Readability
- Fast scanning
- Operational efficiency

---

# Claude Code Instructions

Before creating any UI:

1. Reuse existing components.
2. Follow this design system.
3. Maintain spacing consistency.
4. Maintain color consistency.
5. Maintain typography consistency.
6. Test responsiveness.
7. Test accessibility.
8. Optimize animations.
9. Avoid visual clutter.
10. Every page should feel like commercial enterprise software.

---

# Success Criteria

The completed UI should immediately give users confidence that they are using a premium Transportation Management System developed by an experienced enterprise software company.

No screen should resemble a quickly generated dashboard or template.

---

**End of Document**