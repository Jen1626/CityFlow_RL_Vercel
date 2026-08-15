# CityFlow — Intelligent Adaptive Traffic Management

Live Demo: `https://city-flow-rl-vercel.vercel.app/`

CityFlow is a browser-based demonstration of an intelligent adaptive traffic signal controller inspired by reinforcement-learning traffic management.

## Features

- Four-way intersection simulation
- North/South and East/West traffic flows
- Adaptive signal selection using queue and waiting metrics
- Red, yellow and green signal phases
- Cars remain in dedicated lanes
- Deterministic safety-gap enforcement between vehicles
- Cars stop before the stop line
- No visual car overlap
- Emergency vehicle priority
- Emergency mode stops all normal traffic
- Vehicle count, average wait, throughput and congestion metrics
- Responsive dashboard UI
- No Node.js or package installation required for the web demo

## Important architecture note

The web deployment is a lightweight browser simulation designed for Vercel. SUMO is included as an optional research/simulation scaffold in the `sumo/` directory, but SUMO itself is not executed by Vercel's static web deployment.

For a full research experiment, the SUMO files can be connected to a local Python/TraCI reinforcement-learning pipeline.

## Vercel deployment

This project is intentionally simple:

- `index.html`
- `style.css`
- `script.js`

No build command is required.

Upload the repository to GitHub and import the repository into Vercel. Vercel will serve `index.html` directly.

## Emergency priority

Click **Trigger Emergency Vehicle**. During the emergency window:

1. Normal traffic stops immediately.
2. The dashboard changes to `EMERGENCY STOP`.
3. The emergency vehicle proceeds through the intersection.
4. Normal signal switching is suspended.
5. After the emergency clears, normal adaptive control resumes.

## SUMO scaffold

The `sumo/` directory contains a minimal network, route and configuration scaffold for extending the project into a SUMO/TraCI experiment.

## Project

CityFlow — Intelligent Adaptive Traffic Management using adaptive signal control and reinforcement-learning-inspired decision metrics.
