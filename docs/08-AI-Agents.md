# 08 - AI Agents & Intelligent Automation

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

This document defines every AI Agent that powers the TMS.

The goal is **not** to create a chatbot.

The goal is to create a team of AI employees that continuously monitor operations, identify problems, generate insights, and assist dispatchers before issues become costly.

Each AI Agent should operate independently while sharing information through the TMS Master database.

---

# AI Philosophy

The AI Agents should behave like experienced operations executives.

They should:

- Observe
- Analyze
- Recommend
- Predict
- Alert
- Learn

AI should **never automatically modify operational data** without user approval unless explicitly configured.

---

# AI Architecture

```
                   TMS MASTER
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   Dashboard        AI Agents      Container 360
        │               │               │
        └───────────────┼───────────────┘
                        │
                 Recommendations
                        │
                  User Approval
                        │
                  Update Database
```

---

# Agent Communication

Every AI Agent can

Read

- TMS Master
- Outlook Data
- Cost Data
- Vendor Data
- OCR Results
- Google Drive Metadata

Agents communicate through TMS Master.

No direct communication between agents.

---

# Agent 1 — Operations Monitoring Agent

Purpose

Continuously monitor daily operations.

Responsibilities

- Detect overdue containers
- Detect approaching LFD
- Detect missing appointments
- Detect missing PU
- Detect missing vendors
- Detect missing invoices
- Detect inactive containers
- Detect stalled workflows

Example

```
Container ABCD1234567

LFD in 12 hours

No appointment found.

Recommendation

Schedule appointment immediately.
```

---

# Agent 2 — Email Intelligence Agent

Purpose

Analyze Outlook emails.

Responsibilities

- Read emails
- Categorize emails
- Match emails to containers
- Generate summaries
- Detect important conversations
- Detect vendor replies
- Identify missing responses
- Update Container 360 summaries

Output

Subject

Summary

Action Required

Priority

---

# Agent 3 — OCR Agent

Purpose

Process image attachments.

Responsibilities

Extract

- Container Number
- PU Number
- Booking Number
- Chassis Number

Calculate confidence.

If confidence is low

Send to Review Queue.

Never auto approve.

---

# Agent 4 — Invoice Intelligence Agent

Purpose

Read PDF invoices.

Extract

- Invoice Number
- Vendor
- Amount
- Dates
- Container Number
- D&D Charges

Validate data.

Send uncertain invoices to review.

---

# Agent 5 — Cost Intelligence Agent

Purpose

Calculate real container costs.

Responsibilities

Generate

Estimated Cost

↓

Actual Cost

↓

Variance

↓

Cost Trends

↓

Forecast

Support

Historical comparisons.

---

# Agent 6 — Vendor Performance Agent

Purpose

Evaluate vendor performance.

Calculate

- On-Time Pickup %
- Average Delay
- Average Response Time
- Average Cost
- D&D Generated
- Appointment Compliance
- Reminder Response Rate

Generate vendor score.

Display leaderboard.

---

# Agent 7 — Reminder Agent

Purpose

Prevent operational delays.

Monitor

- LFD
- Missing Vendor Updates
- Missing Appointments
- Missing PU
- Missing Invoice

Before sending reminder

Verify

Vendor has not already replied.

Use Outlook Desktop to send reminders.

Maintain reminder history.

---

# Agent 8 — Document Intelligence Agent

Purpose

Manage Google Drive documents.

Detect

- New Files
- Missing Files
- Duplicate Files
- Incorrect Links

Automatically associate

- POD
- Invoice
- Gate Receipt
- PU Screenshot

with the correct container.

---

# Agent 9 — Synchronization Agent

Purpose

Monitor synchronization.

Responsibilities

- Detect sync failures
- Retry failed imports
- Validate imported records
- Detect duplicate containers
- Detect conflicts
- Generate synchronization reports

---

# Agent 10 — Container Health Agent

Purpose

Evaluate operational health.

Generate score

Example

```
Container Health

94%

Status

Healthy
```

Factors

- Appointment
- Vendor Response
- Invoice
- LFD
- Documents
- Cost
- Timeline

---

# Agent 11 — Predictive Risk Agent

Purpose

Predict future problems.

Examples

High D&D Risk

Vendor Delay Risk

Appointment Risk

Cost Overrun

Late Empty Return

Late Pickup

Use

Historical data

Current status

Vendor history

Terminal history

Generate

Low

Medium

High

Critical

Risk.

---

# Agent 12 — Executive Insights Agent

Purpose

Generate management summaries.

Examples

```
Today's Overview

18 containers require attention.

Estimated D&D exposure increased by 12%.

Vendor ABC response time improved.

3 invoices still missing.
```

Should appear on dashboard.

---

# Agent 13 — AI Search Agent

Purpose

Power intelligent search.

Allow users to ask

```
Show overdue containers.

Which vendor has the highest D&D?

Containers arriving tomorrow.

Invoices above $500.

Show containers without appointments.
```

Return structured results.

---

# Agent 14 — Recommendation Agent

Purpose

Recommend actions.

Examples

```
Assign Vendor

Request Appointment

Contact Terminal

Review Invoice

Approve OCR

Send Reminder
```

Never perform actions automatically.

---

# Agent 15 — Data Quality Agent

Purpose

Maintain database quality.

Detect

- Missing values
- Invalid dates
- Invalid vendors
- Duplicate invoices
- Duplicate containers
- Incorrect formats

Generate quality score.

---

# Agent Dashboard

Create a dedicated page

```
AI Operations Center
```

Display

- Agent Status
- Last Run
- Recommendations
- Errors
- Queue Size
- Health
- Processing Time

---

# AI Processing Schedule

Support

Manual

Automatic

Scheduled

Event Driven

Example

```
Synchronization Complete

↓

Run Email Agent

↓

Run OCR

↓

Run Invoice Agent

↓

Run Cost Agent

↓

Run Risk Agent

↓

Refresh Dashboard
```

---

# AI Logs

Every AI action must log

Date

Time

Agent

Input

Output

Confidence

Processing Time

Errors

---

# Human Approval

The following always require approval

- OCR Corrections
- Invoice Matching
- Cost Overrides
- Vendor Changes
- Appointment Changes
- AI Recommendations

AI should assist.

Humans decide.

---

# AI Confidence

Every prediction should include

```
Confidence

98%

High
```

or

```
Confidence

62%

Medium
```

---

# Performance

AI should

Run in background.

Avoid blocking UI.

Cache expensive calculations.

Process only changed records.

---

# Future AI Agents

Architecture should support

- Voice Assistant
- Chat Assistant
- Driver Assistant
- Customer Assistant
- ETA Prediction
- Weather Intelligence
- Port Congestion Prediction
- Carrier Intelligence
- Customs Intelligence
- Fuel Cost Prediction
- Smart Dispatch Optimization

without changing the architecture.

---

# Claude Code Instructions

Implement AI using a modular agent architecture.

Each agent should

- Have a single responsibility.
- Operate independently.
- Read from TMS Master.
- Log every action.
- Return structured recommendations.
- Never directly modify protected operational data.
- Support future LLM integration.

Design agents as reusable services rather than UI components.

---

# Success Criteria

The AI system should function like an experienced operations team working continuously in the background.

By opening the TMS, a dispatcher or manager should immediately know:

- What needs attention?
- Which containers are at risk?
- Which vendors require follow-up?
- Which invoices are missing?
- Which costs are increasing?
- What actions should be taken next?

The AI Agents should transform the TMS from a data management system into an intelligent operational platform that proactively assists users while keeping humans in control of all critical decisions.

---

**End of Document**