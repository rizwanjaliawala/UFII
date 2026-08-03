# 11 - Claude Code Development Rules

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

This document defines the mandatory development rules that Claude Code must follow throughout the project.

These rules override convenience.

The objective is to ensure the application remains consistent, maintainable, scalable and production-ready throughout development.

Claude Code should behave like a Senior Staff Software Engineer and Enterprise Software Architect, not a code generator.

---

# Primary Mission

Build a premium enterprise Transportation Management System.

The application should look and behave like software developed over several years by an experienced engineering team.

Every implementation should prioritize:

- Quality
- Maintainability
- Performance
- Readability
- Security
- Scalability

Never prioritize speed over architecture.

---

# General Rules

Before writing any code

Claude must

1. Read **00-README.md**
2. Read the relevant documentation file.
3. Understand existing architecture.
4. Search for reusable components.
5. Reuse before creating new.
6. Preserve existing functionality.
7. Avoid breaking changes.

---

# Development Workflow

For every task

```
Understand

↓

Plan

↓

Implement

↓

Review

↓

Refactor

↓

Test

↓

Optimize

↓

Complete
```

Never skip planning.

---

# UI Rules

Always follow

02-UI-UX-Design-System.md

Requirements

- Enterprise appearance
- Consistent spacing
- Consistent typography
- Accessible UI
- Responsive layouts
- Reusable components
- Smooth animations
- Premium user experience

Never create inconsistent interfaces.

---

# Component Rules

Components should

- Have a single responsibility.
- Be reusable.
- Be fully typed.
- Accept configurable props.
- Avoid duplicated logic.
- Include loading states.
- Include empty states.
- Include error states.

---

# Business Logic Rules

Business logic must

Never exist inside

- Pages
- Components
- Layouts

Business logic belongs in

Services

Utilities

Hooks

Store

---

# State Management

Use Zustand.

Keep stores modular.

Examples

```
containerStore

dashboardStore

vendorStore

syncStore

settingsStore
```

Avoid massive global stores.

---

# Routing Rules

Every feature must use

React Router.

Keep routes clean.

Example

```
dashboard

containers

container/:id

vendors

cost-analysis

reports

alerts

settings

sync
```

---

# Styling Rules

Use

Tailwind CSS

Do not use inline styles.

Avoid custom CSS unless absolutely necessary.

Keep spacing consistent.

---

# Animation Rules

Use

Framer Motion

Animations should

- Feel premium
- Be subtle
- Never reduce usability
- Never reduce performance

Maximum duration

```
300ms
```

---

# Performance Rules

Always

Lazy load

Large components

Large pages

Charts

Documents

PDF viewers

Email conversations

Avoid unnecessary rendering.

---

# Data Rules

The application works from

```
TMS Master
```

Never directly modify

Source Sheet 1

Source Sheet 2

Google Drive

Outlook

These are external systems.

---

# Synchronization Rules

Only the Synchronization Engine communicates with

- Source Sheets
- Google Drive
- Outlook

All application modules read from

TMS Master.

---

# Outlook Rules

Version 1 uses

Outlook Desktop Automation.

Do NOT implement

Microsoft Graph

OAuth

Azure App Registration

Stored passwords

Browser scraping

Email processing should remain invisible to the user.

---

# OCR Rules

OCR results

Never auto approve.

Always require manual review.

Store

Confidence

Original Image

Edited Value

Approval Status

---

# Invoice Rules

Never automatically

Approve invoices.

Allow

Manual Review

Correction

Approval

Audit Trail

---

# Cost Rules

Always preserve

Estimated Cost

Actual Cost

Variance History

Never overwrite historical financial records.

---

# AI Rules

AI should

Recommend

Predict

Summarize

Analyze

Never silently change operational data.

Require user approval where appropriate.

---

# Error Handling

Every service must

Return meaningful errors.

Never expose

Stack traces

Internal paths

Sensitive information

Provide user-friendly messages.

---

# Logging Rules

Every important action must be logged.

Examples

Synchronization

OCR

Invoices

Emails

Cost Changes

Vendor Changes

AI Actions

Errors

User Activity

---

# Security Rules

Never

Hardcode credentials

Store passwords

Expose secrets

Expose API keys

Commit confidential data

Use environment variables.

---

# Code Quality

Always

Use TypeScript

Use interfaces

Use reusable functions

Keep files small

Split complex logic

Document difficult code

Remove dead code

Avoid duplication

---

# Testing Rules

Before completing a feature verify

- Functionality
- Responsiveness
- Error Handling
- Accessibility
- Performance
- Type Safety

Never consider a feature complete without testing.

---

# Refactoring Rules

Whenever touching existing code

Improve

Naming

Readability

Performance

Maintainability

without breaking functionality.

Leave the codebase cleaner than it was.

---

# Documentation Rules

Every major feature should include

Purpose

Business Rules

Dependencies

Limitations

Future Enhancements

Update documentation whenever architecture changes.

---

# Git Rules

Preferred commit format

```
feat: add vendor KPI engine

fix: resolve duplicate email processing

refactor: optimize synchronization engine

docs: update AI agent documentation

perf: improve dashboard rendering
```

Small, focused commits.

---

# User Experience Rules

The user should never wonder

"What do I do next?"

Provide

- Helpful messages
- Smart defaults
- Clear navigation
- Fast feedback
- Smooth workflows

Reduce clicks wherever possible.

---

# Enterprise Standards

Every screen should feel suitable for a company processing thousands of containers every month.

Avoid

- Placeholder text
- Dummy layouts
- Inconsistent spacing
- Generic dashboards
- Unfinished components

Everything should feel polished.

---

# Future-Proofing

Every implementation should allow future support for

- PostgreSQL
- SQL Server
- Microsoft Graph
- Azure
- Docker
- Multi-company
- Multi-warehouse
- Mobile application
- REST APIs
- AI model upgrades

without major rewrites.

---

# Things Claude Must Never Do

Never

- Rewrite working architecture without reason.
- Duplicate business logic.
- Create huge components (>300 lines) when they can be split.
- Mix UI and backend logic.
- Ignore TypeScript errors.
- Leave TODO placeholders in completed features.
- Remove audit logging.
- Break backward compatibility.
- Modify source Google Sheets.
- Store passwords or secrets in source code.
- Auto-approve OCR or invoices.
- Ignore documentation.

---

# Definition of Done

A feature is complete only if

✓ Business requirements implemented

✓ Enterprise UI completed

✓ Responsive

✓ Accessible

✓ Error handled

✓ Loading states included

✓ Empty states included

✓ Fully typed

✓ Reusable

✓ Logged

✓ Tested

✓ Performance optimized

✓ Documentation updated

✓ No TypeScript errors

✓ No ESLint errors

✓ No console errors

---

# Final Instruction

Act as a Senior Enterprise Software Architect throughout the project.

Do not simply generate code.

Design systems.

Build reusable architecture.

Question poor design decisions.

Optimize continuously.

Prefer long-term maintainability over short-term convenience.

Every commit should move the application closer to becoming a commercial-grade Transportation Management System comparable to Oracle Transportation Management, SAP TM, project44, FourKites or Uber Freight.

Quality is the highest priority.

---

# End of Document