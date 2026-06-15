# Apple Fitness+ Interactive Step & Workout Tracker

A premium React Single Page Application (SPA) designed to replicate the aesthetics and interactiveness of **Apple Fitness**. Featuring dark-themed glassmorphism panels, animated SVG activity rings, step & stair climbing simulation, live sports logging, calculators, and interactive multi-device layout simulators.

## Features

- **Activity Rings Summary**: Concentric animated rings tracking Move (Calories), Exercise (Minutes), and Stand/Stairs (Floors/Stairs climbed) with custom goals.
- **Dynamic Counters**: Monitors active steps, vertical climbs (up-stairs), descendings (down-stairs), active calories, and distance.
- **Sensor & Simulator Engine**:
  - Interactive simulator buttons (Step +100, Stairs Up, Stairs Down) with speed multipliers (1x, 2x, 5x).
  - Pedometer/Motion sensor API integration for actual mobile phone step counting.
- **Workout Sessions**: Live workout trackers for **Running**, **Walking**, **Swimming**, **Badminton**, **Tennis**, **Cycling**, and **Yoga** capturing real-time calories, heart rate (randomized realistic fluctuation), and custom metrics.
- **Fitness Calculators**: Fully integrated BMI calculator, Pace calculator, and Daily target calorie planner.
- **History Logs & Achievements**: Tracks lifetime accomplishments and unlocks medals (e.g. Early Walker, Stair Master, Super Step) dynamically.
- **Device Simulator Controls**: Outer selector bar allowing previews of layout variants across different viewports:
  - Full Screen
  - iPhone 15 Pro
  - iPhone 15 Pro Max
  - iPad Pro 11"
  - Android (Galaxy S24 Ultra)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the local URL (usually `http://localhost:5173`).

### Production Build

To create an optimized production build:
```bash
npm run build
```
The output will be scaffolded in the `dist` directory.
