# 04 - Container 360° Intelligence

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

Container 360° is the heart of the application.

When a dispatcher, operations executive or manager opens a container, they should never need to search another screen, Google Sheet or Outlook email.

Everything related to that container must be available from one intelligent workspace.

Container 360 should become the **single source of operational truth**.

---

# Design Philosophy

One Container

↓

One Screen

↓

Everything Related

The user should understand the entire history of the container within seconds.

---

# Opening Container 360

Container 360 opens when:

- Clicking a container anywhere
- Clicking a dashboard widget
- Clicking a notification
- Clicking search results
- Clicking reports

Always open with a smooth drawer or page transition.

---

# Layout

```
----------------------------------------------------

Header

----------------------------------------------------

Container Summary

Status Timeline

----------------------------------------------------

Operational Details

Vendor Details

----------------------------------------------------

Email Intelligence

Attachments

----------------------------------------------------

Invoices

Cost Analysis

----------------------------------------------------

AI Insights

Activity Log

----------------------------------------------------
```

---

# Header

Display

Container Number

Current Status

Vendor

SSL

Terminal

LFD Countdown

Quick Actions

Favorite Button

Refresh

---

# Status Banner

Color Coding

Green

Safe

Amber

Approaching LFD

Red

Overdue

Blue

Completed

Gray

Archived

---

# Quick Actions

Allow

Assign Vendor

Edit Appointment

Open Documents

Send Reminder

View Conversation

Open Invoice

Refresh Container

Copy Container Number

Export PDF

Print

---

# Container Summary

Display

Container Number

Booking Number

PU Number

ISA

FC

Size

Type

Weight

Vendor

SSL

Terminal

Appointment

Pickup Date

Delivery Date

Gate In

Gate Out

Empty Return

Last Free Day

Current Status

---

# Timeline

Show every important event.

Example

```
Container Imported

↓

Vendor Assigned

↓

PU Received

↓

Appointment Scheduled

↓

Picked Up

↓

Gate Out

↓

Delivered

↓

Empty Returned

↓

Invoice Imported

↓

Closed
```

Every event should display

- Date
- Time
- User
- Source
- Notes

---

# Operational Details

Display

Pickup Location

Delivery Location

Port

Rail Ramp

Chassis Number

Appointment Time

Appointment Status

Dispatch Notes

Special Instructions

Reference Numbers

---

# Vendor Section

Display

Vendor Name

Phone

Email

Dispatcher

Performance Score

Average Response Time

Open Containers

Completed Containers

Outstanding Reminders

Recent Performance Trend

---

# Vendor KPIs

Show

On-Time Pickup %

Average Delay

Average Response Time

Containers This Month

Average Cost

D&D Cost

Overall Score

---

# Email Intelligence

This section summarizes all Outlook activity related to the container.

The user should never need to manually search Outlook.

---

# Email List

Display

Subject

Sender

Received Date

Category

Attachment Indicator

Thread Indicator

One-line Summary

Example

```
Subject

PU Available

Received

Today 9:24 AM

Summary

PU confirmed by terminal.
```

---

# Show Conversation

Every email includes

```
Show Conversation
```

When clicked

Open a drawer.

---

# Conversation Drawer

Display

Subject

Participants

Date

Conversation Timeline

AI Summary

Example

```
Jul 3

Vendor requested appointment.

↓

Jul 4

Dispatcher confirmed.

↓

Jul 5

Appointment approved.

↓

Jul 6

Vendor confirmed pickup.
```

---

# AI Conversation Summary

Generate a short summary.

Example

```
Vendor confirmed pickup.

Appointment scheduled.

No unresolved issues.

No additional action required.
```

Never rewrite or modify emails.

Only summarize.

---

# Attachments

Automatically associate

PU Screenshots

Invoice PDFs

Gate Receipts

POD

Delivery Photos

Emails

Support

Preview

Download

Open

Share

---

# OCR Results

Display

Detected PU

Confidence

Original Screenshot

Approval Status

Manual Correction

Approve

Reject

Never update automatically.

---

# Invoice Section

Display

Invoice Number

Vendor

Amount

Invoice Date

Due Date

Status

Payment Status

Linked Documents

Open Invoice

---

# Cost Summary

Display

Expected Cost

Actual Cost

Difference

Estimated Remaining Cost

Cost Trend

Button

```
Open Cost Analysis
```

---

# AI Insights

Generate operational insights.

Examples

```
Container is approaching LFD.

Vendor has not replied.

Reminder recommended.

Expected D&D cost increasing.

Historical vendor delay detected.
```

Keep summaries concise and actionable.

---

# Recommendations

Examples

```
Contact Vendor

Schedule Pickup

Request Appointment

Verify Invoice

Review OCR

Investigate Delay
```

---

# Related Containers

Display containers with

Same Vendor

Same SSL

Same Terminal

Same Appointment Date

Same Booking

---

# Activity Log

Every action should appear.

Examples

```
Container Imported

Invoice Linked

Vendor Assigned

Reminder Sent

Email Processed

Synchronization Completed

Document Uploaded

Appointment Updated
```

Display

Date

Time

User

Action

---

# Notes

Users can add

Operational Notes

Vendor Notes

Internal Comments

Pinned Notes

Notes should never overwrite imported data.

---

# Synchronization Information

Display

Imported From

Source Sheet

Import Date

Last Sync

Sync Status

Conflict Status

---

# Data Sources

Container 360 combines data from

Source Sheet 1

↓

Source Sheet 2

↓

Google Drive

↓

Outlook

↓

OCR Engine

↓

Invoice Parser

↓

TMS Master

↓

AI Engine

Everything is displayed in one location.

---

# Search Within Container

Allow searching

Emails

Documents

Invoices

Notes

Timeline

---

# Keyboard Shortcuts

Support

Open Search

Refresh

Print

Open Conversation

Open Invoice

Copy Container Number

---

# Permissions

Operations

Full Access

Managers

Full Access

Read Only Users

No Editing

Administrators

Everything

---

# Performance

Container 360 should load in under 2 seconds.

Lazy load

- Email History
- Attachments
- Documents
- Conversation
- AI Summary

Only load heavy content when requested.

---

# Error Handling

If a source is unavailable

Show

```
Email service unavailable.

Retry
```

or

```
Invoice temporarily unavailable.
```

Never crash the page.

---

# Future Enhancements

Design Container 360 to support

- Live GPS
- Driver Tracking
- Customer Visibility
- ETA Prediction
- Weather Alerts
- Port Congestion
- AI Risk Scoring
- Voice Assistant

without redesigning the architecture.

---

# Claude Code Instructions

Container 360 is the flagship feature of the application.

Treat it as the operational cockpit for every container.

Requirements

- Aggregate all available information into one screen.
- Never duplicate data.
- Read operational data from **TMS Master**.
- Retrieve documents from Google Drive.
- Retrieve conversation summaries from Outlook processing.
- Display AI-generated insights only as recommendations.
- Keep the interface fast, uncluttered and enterprise-grade.
- Every section should support loading, empty and error states.
- Every card should be reusable.

---

# Success Criteria

A dispatcher should be able to answer **every operational question about a container** from this single screen.

The user should not need to open Google Sheets, Google Drive or Outlook to understand the status, history, communication, documents, invoices or costs associated with that container.

Container 360 should be the most powerful and information-rich module in the entire TMS.

---

**End of Document**