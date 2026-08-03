# 01 - Project Foundation

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

This document defines the engineering standards, architecture, development philosophy, business rules, and technical foundation of the Utopia Transportation Management System.

Every developer, AI coding assistant, and future contributor must follow this document before implementing any feature.

---

# Project Vision

Build a modern enterprise Transportation Management System that centralizes all container operations into one intelligent platform.

The application should replace multiple Google Sheets, Outlook email workflows, and manual tracking processes with a single operational system.

The finished product should resemble commercial enterprise software rather than a prototype or AI-generated application.

Examples of quality:

- Oracle Transportation Management
- SAP TM
- project44
- FourKites
- Uber Freight
- Trimble

---

# Primary Objectives

The system must provide a complete operational view of every container.

The application will manage:

- Container Operations
- Pickup Numbers (PU)
- Last Free Day (LFD)
- Vendor Operations
- Appointment Scheduling
- Gate In
- Gate Out
- Empty Return
- Detention & Demurrage
- Cost Analysis
- Email Processing
- OCR
- AI Insights
- Reports
- Dashboards
- Synchronization

---

# Development Philosophy

The project must prioritize:

- Maintainability
- Scalability
- Readability
- Performance
- Reusability
- Simplicity
- Reliability

Every implementation should be production quality.

Avoid shortcuts.

Never build features that require major rewrites later.

---

# Architecture

Use a modular layered architecture.

```
Presentation Layer
        │
Business Logic Layer
        │
Service Layer
        │
Integration Layer
        │
Storage Layer
```

Every layer must remain independent.

Business logic must never exist inside UI components.

---

# Technology Stack

## Frontend

- React
- TypeScript
- React Router
- Tailwind CSS
- Framer Motion
- Zustand
- React Hook Form
- Zod
- TanStack Table
- Recharts

---

## Backend

- Node.js
- Express

---

## Processing

- Outlook Desktop Automation (Windows COM)
- Tesseract OCR
- pdf-parse
- node-cron

---

# Folder Structure

## Frontend

```
src/

components/

layouts/

pages/

features/

hooks/

services/

store/

utils/

types/

assets/

styles/
```

---

## Backend

```
server/

routes/

controllers/

services/

repositories/

middleware/

jobs/

config/

utils/

logs/
```

---

# Coding Standards

Always follow:

- SOLID
- DRY
- KISS

Use:

- Small reusable components
- Service pattern
- Repository pattern
- Utility functions
- Centralized configuration

Avoid duplicated code.

---

# Naming Standards

Components

```
ContainerCard.tsx
VendorTable.tsx
DashboardLayout.tsx
```

Pages

```
DashboardPage.tsx

ContainerDetailsPage.tsx

VendorPage.tsx
```

Services

```
SyncService.ts

OutlookService.ts

CostService.ts
```

Hooks

```
useContainers.ts

useDashboard.ts

useInvoices.ts
```

---

# State Management

Use Zustand.

Keep stores modular.

Example:

```
containerStore

dashboardStore

vendorStore

syncStore

settingsStore
```

Avoid one massive global store.

---

# Routing

Use React Router.

Every major module should have its own route.

Example

```
/

dashboard

containers

containers/:id

vendors

cost-analysis

reports

alerts

settings

sync
```

---

# Data Architecture

The application uses three Google Sheets.

## Source Sheet 1

Purpose

Operational Data

Permissions

Read Only

Never modify.

---

## Source Sheet 2

Purpose

Detention & Demurrage

Permissions

Read Only

Never modify.

---

## TMS Master

Purpose

Primary application database.

Every module reads from and writes to this sheet.

Never modify the source sheets.

---

# Google Resources

During development Google Drive and Google Sheets are already connected inside Claude Code.

Claude may inspect those resources during development.

The finished application must work independently after deployment.

---

# Synchronization Philosophy

Never query the source sheets during normal application usage.

Instead:

```
Source Sheet 1

↓

Source Sheet 2

↓

Import Engine

↓

Merge Engine

↓

TMS Master

↓

Entire Application
```

All modules should operate from TMS Master.

---

# Synchronization Engine

Responsibilities

- Read both source sheets
- Detect new containers
- Detect updates
- Detect duplicates
- Detect conflicts
- Merge records
- Preserve internal data
- Update TMS Master

Support:

- Refresh Data button
- Automatic synchronization
- Configurable schedule
- Synchronization logs
- Last synchronization time

---

# Google Drive

Google Drive stores:

- PU screenshots
- Invoice PDFs
- POD
- Gate Receipts
- Supporting Documents

Every document must be linked to the appropriate container.

Store the Google Drive File ID inside TMS Master.

---

# Outlook

Version 1 uses Outlook Desktop Automation.

Requirements

- Read the signed-in Outlook profile
- Read incoming mail
- Download attachments
- Read conversation threads
- Prevent duplicate processing
- Send reminder emails

Do NOT use:

- Microsoft Graph
- OAuth
- Stored passwords

---

# Performance Standards

The application should:

- Lazy load pages
- Cache frequently used data
- Virtualize large tables
- Avoid unnecessary re-renders
- Minimize API calls
- Process only changed records during synchronization

Target smooth interaction throughout the application.

---

# Security Standards

- Store secrets in environment variables
- Validate all user input
- Sanitize imported data
- Log important operations
- Never expose credentials
- Maintain audit history

---

# Error Handling

Every service should return meaningful errors.

Never expose stack traces to users.

Log:

- Sync failures
- Outlook failures
- OCR failures
- Invoice parsing failures
- Google integration failures

Provide user-friendly notifications.

---

# Logging

Maintain centralized logs for:

- Synchronization
- Email Processing
- OCR
- Invoice Processing
- User Actions
- System Errors

---

# Configuration

Create a centralized configuration module.

Configuration should include:

- Synchronization interval
- Outlook settings
- Google settings
- Reminder settings
- Cost calculation settings
- Feature flags

Avoid hardcoding values throughout the application.

---

# Business Rules

The following business logic must never be broken during refactoring:

- Container lifecycle
- Vendor KPIs
- Cost calculations
- Synchronization logic
- Email processing
- OCR
- Invoice parsing
- Reminder engine
- AI recommendations

UI redesign must never change business logic.

---

# Definition of Done

A feature is complete only when:

- Fully functional
- Fully tested
- Responsive
- Accessible
- Error handled
- Logged
- Documented
- Integrated with existing architecture
- No duplicate code
- No placeholder implementations

---

# Claude Code Rules

Before implementing any feature:

1. Read this document.
2. Read the relevant module documentation.
3. Reuse existing components whenever possible.
4. Preserve architecture.
5. Do not introduce breaking changes.
6. Keep components small and reusable.
7. Keep business logic outside UI.
8. Maintain enterprise UI consistency.
9. Test all changes.
10. Leave the codebase cleaner than before.

---

# Success Criteria

The finished application should be capable of supporting daily container operations for Utopia Fulfillment Inc. while maintaining enterprise-grade quality, performance, and maintainability.

Every implementation should prioritize long-term stability over short-term convenience.

---

**End of Document**