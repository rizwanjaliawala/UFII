# Utopia Fulfillment Inc - Transportation Management System (TMS)

> Enterprise-grade Transportation Management System for container drayage operations.

**Version:** 1.0  
**Status:** In Development

---

# Project Overview

Utopia TMS is an enterprise Transportation Management System (TMS) designed specifically for container drayage operations.

The goal is to replace multiple Google Sheets, Outlook emails and manual processes with one modern enterprise application.

The application must provide a premium experience comparable to commercial software such as:

- Oracle Transportation Management
- SAP Transportation Management
- Uber Freight
- project44
- FourKites
- Trimble

The application must **never** feel like a quickly generated AI project.

---

# Core Objectives

The application will manage the complete lifecycle of every container.

Including:

- Container Operations
- Pickup Numbers (PU)
- Last Free Day (LFD)
- Vendor Management
- Appointment Management
- Detention & Demurrage
- Cost Analysis
- Email Processing
- OCR Processing
- AI Insights
- Reports
- Dashboards
- Google Synchronization

---

# Documentation Structure

Always read the documentation relevant to the task before writing code.

```
docs/

00-README.md

01-Project-Foundation.md

02-UI-UX-Design-System.md

03-Dashboard-Core-Modules.md

04-Container-360.md

05-Outlook-Integration.md

06-Google-Synchronization.md

07-Cost-Analysis.md

08-AI-Agents.md

09-Security-Administration.md

10-Performance-Deployment.md

11-Claude-Code-Rules.md
```

---

# Development Order

The project should be developed in the following order.

Phase 1

Project Foundation

↓

UI Design System

↓

Authentication

↓

Application Layout

↓

Navigation

↓

Dashboard

↓

Container Search

↓

Container 360

↓

Vendor Module

↓

PU / LFD

↓

D&D

↓

Cost Analysis

↓

Google Synchronization

↓

Outlook Integration

↓

AI Agents

↓

Reports

↓

Settings

↓

Testing

↓

Optimization

---

# Technology Stack

## Frontend

- React
- TypeScript
- Tailwind CSS
- React Router
- Zustand
- Framer Motion
- TanStack Table
- React Hook Form
- Zod
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

# Data Sources

The application uses three Google Sheets.

## Source Sheet 1

Purpose

Operational Container Data

Permissions

Read Only

---

## Source Sheet 2

Purpose

Detention & Demurrage

Permissions

Read Only

---

## TMS Master

Purpose

Primary Application Database

Permissions

Read / Write

Every application module must read and write only to this sheet.

The source sheets must never be modified.

---

# Google Drive

Google Drive is already connected during development.

It contains

- PU screenshots
- D&D invoices
- POD
- Supporting documents

Documents must be associated with the correct container.

---

# Outlook

Version 1 will use Outlook Desktop Automation.

Requirements

- Read current Outlook profile
- Read emails
- Download attachments
- OCR screenshots
- Parse PDF invoices
- Prevent duplicate processing
- Send reminder emails

No Microsoft Graph.

No OAuth.

No password storage.

---

# Primary Modules

- Dashboard
- Container Search
- Container 360
- PU / LFD
- D&D
- Vendor
- Cost Analysis
- Alerts
- Reports
- AI Assistant
- Settings
- Administration
- Synchronization

---

# Development Principles

Always build production-quality code.

Follow:

- SOLID
- DRY
- KISS

Never create unnecessary complexity.

Prefer reusable components.

Separate UI from business logic.

Never hardcode credentials.

Use environment variables.

Document complex functions.

Keep components small and reusable.

---

# Claude Code Instructions

Before starting any task:

1. Read this README.
2. Read the relevant documentation file.
3. Understand the feature completely.
4. Reuse existing components.
5. Maintain consistent UI.
6. Never break existing business logic.
7. Test before considering the task complete.

---

# Success Criteria

The final application should look and feel like enterprise software built by a dedicated engineering team.

Every screen should be fast, polished, responsive, maintainable and production-ready.

Quality is more important than speed.

Never sacrifice architecture for convenience.