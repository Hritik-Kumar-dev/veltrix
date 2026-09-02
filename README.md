<div align="center">

# ⚡ VELTRIX

### *Local-first batch image & document processing, reimagined.*

`crop` · `align` · `compress` · `print` — all in your browser, all offline

![status](https://img.shields.io/badge/status-in%20development-8A2BE2?style=for-the-badge)
![privacy](https://img.shields.io/badge/data-never%20leaves%20your%20device-00FFFF?style=for-the-badge)
![platform](https://img.shields.io/badge/platform-web%20%7C%20mobile%20(soon)-FF006E?style=for-the-badge)

</div>

---

## ◈ What is Veltrix?

Veltrix is **not** an artistic photo editor — it's a precision instrument for the unglamorous, repetitive work of getting *images and documents* into the exact shape institutions demand. Passport photos. Scanned forms. Signatures. Batches of student IDs. The stuff that usually takes an afternoon in fifty browser tabs.

Veltrix does it **locally, instantly, and privately** — nothing you process is ever uploaded to a server.

> **Import → Edit → Preview → Save → Organize → Export**
> One pipeline. Zero uploads. Full control.

---

## ◈ Core Features

| Module | What it does |
|---|---|
| 🖼️ **Non-Destructive Editor** | Original image and processed output are kept fully separate — edit freely, revert anytime |
| ✂️ **Smart Crop** | Standard crop + 4-corner perspective crop with edge-midpoint handles, fine & 90° rotation |
| 📐 **Aspect Presets** | Passport (7:9), square, and custom ratios, live-previewed |
| 📄 **PDF Import** | Drop in a PDF, get each page as an editable item |
| 🗂️ **Gallery Engine** | Drag-and-drop reordering, duplication, delete/undo |
| 🗜️ **Target Compression** | Squeeze to 100KB / 200KB / 500KB / 1MB for upload-limit compliance |
| 🏷️ **Bulk Rename** | Prefix + sequential numbering, gallery-order aware |
| 📦 **ZIP Export** | Custom filenames, batch download |
| 🖨️ **Print Studio** | Real-world mm/cm/inch layout on A4/A3/Legal/B4/custom pages, freeform placement, print-ready export |
| 🎯 **Auto Crop** *(in progress)* | Photo mode (face detection + passport heuristics) & Document mode (edge/contour detection + straightening) |
| ⚡ **Auto-Apply** *(in progress)* | Runs Auto Crop the instant an image is selected — no button press |

---

## ◈ Design Philosophy

```
┌─────────────────────────────────────────────┐
│  PRIVACY FIRST     →  processing stays local │
│  SPEED              →  no round-trip to a server │
│  PRECISION          →  built for compliance-grade output │
│  NON-DESTRUCTIVE    →  originalDataUrl ≠ processedDataUrl │
└─────────────────────────────────────────────┘
```

Every image carries two states under the hood:

- `originalDataUrl` — the untouched source, always recoverable
- `processedDataUrl` — the saved, edited output

This means you can iterate aggressively without ever fearing data loss.

---

## ◈ Keyboard-First Workflow

| Key | Action |
|---|---|
| `Space` | Save current image & advance to next |
| `Drag` | Reorder gallery items |

*(More shortcuts coming as the editor matures.)*

---

## ◈ Roadmap

- [x] Core crop / rotate / preset editor
- [x] PDF import & page splitting
- [x] Bulk rename + ZIP export
- [x] Print Studio (mm-canonical, multi-image page layout)
- [ ] Auto Crop — Photo mode (face detection)
- [ ] Auto Crop — Document mode (contour detection)
- [ ] Auto-Apply toggle — full wiring
- [ ] 📱 **Veltrix Mobile** — a standalone React Native app (`veltrixapp`), camera-first capture with instant Auto Crop, aiming for full feature parity with the web app

---

<div align="center">

### ◈ Built for the batch. Built for privacy. Built for speed. ◈

*Veltrix — your files never leave the room.*

</div>
