# 05 - Outlook Integration & Email Intelligence

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

This document defines how the TMS interacts with Microsoft Outlook.

The objective is to eliminate the need for dispatchers to manually search Outlook for PU numbers, invoices, vendor replies and conversations.

The Outlook module acts as an intelligent email processor rather than a traditional email client.

---

# Version 1 Architecture

Version 1 will use:

## Outlook Desktop Automation

Windows COM Automation

Reason:

- User is already signed into Outlook.
- No Microsoft Graph.
- No OAuth.
- No Azure App Registration.
- No password storage.
- No tenant configuration.
- Minimal deployment effort.

The application simply communicates with the Outlook instance already running on the user's computer.

---

# Outlook Requirements

The module must:

- Read Inbox
- Read Sent Items
- Read Deleted Items (optional)
- Read custom folders
- Read conversation threads
- Download attachments
- Detect duplicate emails
- Categorize emails
- Associate emails with containers
- Send reminder emails
- Record processing history

---

# Processing Workflow

```
User opens application

↓

Clicks Refresh Data
(or automatic refresh)

↓

Read Outlook

↓

Detect new emails

↓

Ignore already processed emails

↓

Download attachments

↓

Extract container numbers

↓

Classify email

↓

Create email summary

↓

Link to TMS Master

↓

Process OCR/PDF if needed

↓

Update Container 360
```

---

# Refresh Modes

Support three modes.

## Manual

Refresh Data button.

Recommended for daily operations.

---

## Automatic

Configurable interval.

Example:

- Every 5 minutes
- Every 10 minutes
- Every 15 minutes
- Every 30 minutes

---

## Startup Refresh

When the application starts:

- Check Outlook
- Process new emails
- Update TMS Master

---

# Duplicate Prevention

Every email should only be processed once.

Track:

- Outlook Entry ID
- Conversation ID
- Internet Message ID
- Received Date

Maintain an Email Processing Log.

---

# Email Categories

Automatically classify emails.

Examples:

PU Available

Appointment

Invoice

Vendor Update

Gate In

Gate Out

Delivery

Empty Return

Reminder Reply

General

Unknown

Allow manual recategorization.

---

# Container Detection

Search:

Subject

Body

Attachments (OCR)

PDF text

Recognize:

Container Number

Booking Number

PU Number

Chassis Number

Reference Numbers

---

# Email Matching

Priority

1.

Exact Container Number

↓

2.

Booking Number

↓

3.

PU Number

↓

4.

Conversation Thread

↓

5.

Manual Review

Never guess.

If confidence is low,

send to Review Queue.

---

# Email Summary

Every email should have an AI-generated summary.

Display

Subject

Sender

Date

Category

One-line Summary

Example

```
Vendor confirmed pickup appointment for tomorrow.
```

Keep summaries short.

Do not rewrite email content.

---

# Conversation Detection

Group emails by

Conversation ID

Thread

Container Number

Display chronologically.

---

# Show Conversation

Container 360 should provide

```
Show Conversation
```

When clicked

Display

Participants

Subject

Timeline

AI Summary

Attachments

---

# AI Conversation Summary

Generate:

- Main topic
- Decisions
- Pending items
- Action required

Example

```
Vendor confirmed appointment.

Invoice pending.

No further action required.
```

---

# Reminder Detection

Before sending reminders

Check

Has vendor already replied?

If YES

Do not send reminder.

If NO

Proceed with reminder.

---

# Reminder Engine

Trigger examples

Missing Vendor Reply

Approaching LFD

Appointment Missing

PU Missing

Invoice Missing

Custom Rules

Reminder templates should be configurable.

---

# Sending Email

Support

Reply

Reply All

New Reminder

Manual Email

Automatic Reminder

Use Outlook.

Do not use SMTP.

---

# Attachments

Automatically detect

Images

PDF

Excel

Word

Text

Download locally

Associate with container

Store reference in TMS Master

---

# OCR Pipeline

Images

↓

OCR

↓

Extract

PU

Container Number

Booking Number

↓

Confidence Score

↓

Review Queue

Never auto-approve.

---

# PDF Processing

PDF

↓

Extract Text

↓

Locate

Invoice Number

Container Number

Vendor

Amount

Dates

↓

Review Queue

↓

Approval

---

# Review Queue

Items requiring manual review

- Low OCR confidence
- Unknown container
- Duplicate invoice
- Missing vendor
- Missing invoice number

Support

Approve

Reject

Edit

---

# Email Processing Log

Store

Processing Date

Outlook Entry ID

Conversation ID

Container

Category

Status

Result

Errors

---

# Error Handling

Handle

Outlook Closed

Outlook Busy

Missing Attachment

OCR Failure

PDF Failure

Permission Errors

Show friendly messages.

Never terminate processing.

---

# Performance

Only process

New emails

Avoid rescanning

entire mailbox.

Use incremental processing.

---

# Configuration

Allow administrators to configure

Refresh Interval

Inbox Folder

Archive Folder

Reminder Templates

Auto Processing

OCR Threshold

Maximum Attachment Size

---

# Security

Never store

Passwords

Outlook credentials

Tokens

Authenticate only through the signed-in Outlook session.

---

# Future Enhancements

Design for future support of

Microsoft Graph

Exchange Online

Shared Mailboxes

Multiple Outlook Profiles

Teams Notifications

Email Rules

without rewriting the architecture.

---

# Claude Code Instructions

Implement Outlook as a background processing service.

The Outlook service must:

- Run independently from the UI.
- Update TMS Master.
- Trigger OCR and PDF processing.
- Associate emails with containers.
- Prevent duplicate processing.
- Generate summaries.
- Maintain processing logs.

Never require the user to reconnect Outlook.

Assume Outlook Desktop is already signed in.

---

# Success Criteria

A dispatcher should never need to manually search Outlook to understand the communication history for a container.

All relevant emails, conversations, summaries, reminders and attachments should be automatically available inside the TMS after synchronization.

The Outlook integration should feel seamless, reliable and invisible to the user.

---

**End of Document**