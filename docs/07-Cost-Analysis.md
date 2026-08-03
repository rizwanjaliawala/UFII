# 07 - Cost Analysis & Financial Intelligence

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

The Cost Analysis module is the financial intelligence center of the TMS.

Its purpose is not only to display invoice amounts, but to calculate the **true operational cost** of every container.

Even if an invoice has not yet been received, the system should estimate the expected cost using operational data and historical trends.

Once the actual invoice is received, the estimated cost is automatically replaced with the verified actual cost.

This module should become the company's primary cost analysis platform.

---

# Design Philosophy

Every container should always have one of these statuses:

```
Estimated Cost

or

Actual Cost
```

The system should never leave a container with an unknown cost.

---

# Dashboard

Display

```
Total Estimated Cost

Total Actual Cost

Pending Invoice Cost

D&D Exposure

Cost Variance

Average Vendor Cost

Total Monthly Cost

Weekly Trend

Today's Cost

Highest Cost Container
```

---

# Cost Sources

Cost calculations should combine information from

```
TMS Master

↓

Operational Data

↓

D&D Source Sheet

↓

Invoice PDFs

↓

Historical Costs

↓

Vendor Performance

↓

AI Prediction
```

---

# Cost Categories

Calculate separately

- Drayage
- Demurrage
- Detention
- Chassis Usage
- Storage
- Lift Charges
- Port Charges
- Yard Charges
- Appointment Fees
- Toll Charges
- Fuel Surcharge
- Accessorial Charges
- Other Charges

Display individual totals.

---

# Container Cost Card

Each container should display

```
Estimated Cost

Actual Cost

Difference

Invoice Status

Vendor

Days in Port

Days on Chassis

D&D Days

Total Charges
```

---

# Expected Cost Engine

If no invoice exists

Calculate expected cost.

Use

- Gate In Date
- Gate Out Date
- Empty Return Date
- Last Free Day
- Vendor
- Terminal
- SSL
- Container Size
- Historical Charges
- Previous invoices
- Chassis Days
- Storage Days

Display

```
Estimated Cost

Confidence %

Calculation Date
```

---

# Actual Cost Engine

When invoice received

Automatically

Replace

```
Estimated Cost

↓

Actual Cost
```

Keep historical estimate for comparison.

Never delete previous estimates.

---

# Variance Analysis

Display

```
Estimated

Actual

Difference

Percentage Difference
```

Example

```
Estimated

PKR 38,000

Actual

PKR 41,500

Variance

+PKR 3,500

+9.2%
```

---

# Invoice Status

Supported values

```
No Invoice

Expected

Received

Under Review

Approved

Paid

Disputed

Cancelled
```

---

# Cost Timeline

Display

```
Container Imported

↓

Estimated Cost Generated

↓

Invoice Received

↓

Invoice Approved

↓

Actual Cost Updated

↓

Payment Completed
```

---

# Vendor Cost Analysis

Display

Average Cost

Highest Cost

Lowest Cost

Monthly Cost

Average D&D

Average Chassis

Average Response Time

Cost Trend

Top Cost Drivers

---

# Terminal Cost Analysis

Compare

Average Cost

by

- Terminal
- SSL
- Vendor
- Month

Support charts.

---

# Monthly Analysis

Display

```
Total Cost

Estimated Cost

Actual Cost

Pending Cost

Paid

Outstanding

Variance
```

---

# D&D Analysis

Display

```
Total Demurrage

Total Detention

Total D&D

Average D&D

Highest D&D

Lowest D&D

Pending D&D
```

---

# Chassis Analysis

Calculate

```
Total Chassis Days

Average Chassis Days

Average Cost Per Day

Highest Chassis Cost

Current Usage
```

---

# Cost Breakdown

Every container should support

```
View Cost Breakdown
```

Display

```
Drayage

Detention

Demurrage

Storage

Chassis

Fuel

Appointment

Accessorial

Other
```

Show percentages.

---

# Historical Analysis

Use previous invoices

to estimate future costs.

Support

30 Days

90 Days

6 Months

12 Months

---

# Cost Prediction

AI should estimate

```
Expected Final Cost

Expected D&D

Risk Level

Expected Invoice Date
```

Display confidence score.

---

# Cost Alerts

Generate alerts

Examples

```
Invoice Missing

Expected Cost High

Cost Exceeds Average

High D&D Risk

Chassis Usage High

Variance Above Threshold
```

---

# Cost Filters

Support

Vendor

Terminal

SSL

Container

Invoice Status

Cost Range

Date Range

Status

---

# Reports

Generate

```
Vendor Cost Report

Monthly Cost Report

D&D Report

Terminal Cost Report

Invoice Report

Variance Report

Outstanding Cost Report
```

Support

PDF

Excel

CSV

---

# Charts

Use

Line

Bar

Area

Pie

Trend

Monthly Comparison

Vendor Comparison

Terminal Comparison

---

# Manual Adjustments

Authorized users may

Adjust

Estimated Cost

Override

AI Prediction

Add

Manual Charges

Every change must be logged.

---

# Audit History

Maintain

```
Who changed

What changed

Old Value

New Value

Reason

Date

Time
```

---

# Performance

Calculations should

Run incrementally.

Cache historical values.

Avoid recalculating unchanged containers.

---

# Future Enhancements

Design architecture to support

- Fuel Index Integration
- Live Chassis Rates
- Port Tariffs
- Carrier APIs
- Financial ERP Integration
- Predictive Cost Forecasting
- Budget vs Actual Analysis

without redesigning the module.

---

# Claude Code Instructions

Implement Cost Analysis as an independent financial engine.

Requirements

- Read operational data from **TMS Master**.
- Read D&D invoice data from synchronized records.
- Generate estimated costs when invoices are unavailable.
- Automatically replace estimated costs with actual costs once invoices are approved.
- Preserve estimate history for variance analysis.
- Never overwrite historical financial records.
- All calculations must be traceable and auditable.
- Every financial change must be logged.

The Cost Analysis module should become the authoritative financial view for every container.

---

# Success Criteria

At any point in time, management should be able to answer:

- What has this container cost?
- What will this container likely cost?
- Why did this cost increase?
- Which vendor is most expensive?
- Which terminal generates the highest D&D?
- Which invoices are still pending?
- How accurate are our cost predictions?

without using external spreadsheets.

The Cost Analysis module should provide complete financial visibility for container operations while remaining fully integrated with Container 360, Dashboard, Reports and AI Agents.

---

**End of Document**