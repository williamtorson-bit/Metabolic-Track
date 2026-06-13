# Metabolic Track

A Vercel-compatible all-in-one weight, fasting and low-carb tracking app.

## Main features

- Branded Metabolic Track logo and app icon.
- Add weight readings in kg or lb.
- Upload or paste previous weight data from CSV/text.
- View trend graph and 3-reading moving average.
- Analyse total weight change, weekly rate, remaining target and estimated timeline.
- Start and stop fasting timer with fasting stage estimates.
- Set low-carb start date and carb target.
- Log daily carbs/protein and meal notes.
- Estimate low-carb/ketosis stage based on days since start date and carb consistency.
- Dark and light mode.
- Local storage data persistence.
- Export backup JSON and CSV.

## Corrections included in this version

- Added a custom SVG logo, favicon and web app manifest.
- Fixed global SVG styling so chart CSS does not distort app icons or the logo.
- Fixed local date/time handling for manual entries and imports.
- Improved CSV/text import parsing, including UK date formats and entries such as `02/08/2025 @ 10:43: 128.75 kg`.
- Added duplicate protection during weight import.
- Added safer state loading and migration from the previous local-storage key.
- Improved trend wording for both weight loss and weight gain patterns.
- Added better form validation and safer export handling.

## Deploy to Vercel

1. Upload this project folder to GitHub, or import it directly into Vercel.
2. In Vercel, choose **Framework Preset: Vite**.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Deploy.

## Run locally

```bash
npm install
npm run dev
```

## CSV import examples

```csv
Date, Weight, Unit, Note
23/07/2025 08:24, 131.8, kg, Home scale
29/07/2025 08:10, 129.45, kg, Ate at 7pm previous night
2025-08-02T10:43, 128.75, kg, Recheck
02/08/2025 @ 10:43: 128.75 kg, Same-day recheck
```

## Important health note

This app provides educational estimates only. It cannot confirm ketosis, diagnose diabetes, or replace medical advice. Ketosis estimates vary by carbohydrate intake, fasting duration, physical activity, medication, hydration, metabolic health and testing method.
