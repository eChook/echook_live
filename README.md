# eChook Live

Real-time telemetry dashboard for Greenpower electric racing cars using the eChook telemetry boards. Built with Vue 3 and designed for teams to monitor car performance during races, and analyze race data after the race.

![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js)
![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)

## Features

### 📊 Real-Time Telemetry
- Live data streaming via WebSocket (MessagePack encoded)
- Auto-reconnection and gap-filling on resume
- Configurable data retention (up to 50k points)

### 📈 Interactive Graphs
- Synchronized time-series charts with ECharts
- Lap highlighting with alternating colors
- Zoom, pan, and keyboard shortcuts (L, R, 1-9, arrows)
- Customizable metric visibility

### 🗺️ Live Map
- Real-time car position on OpenStreetMap
- Historical trail with speed-based color gradient
- Configurable trail length and auto-fitting

### 🏁 Race Analytics
- Automatic race and lap detection
- Lap-to-lap comparison with delta highlighting
- CSV export for external analysis

### 👥 Spectator Mode
- Public spectator view (no login required)
- Real-time car selector with live stats
- Privacy opt-out for teams

### ⚙️ Admin Dashboard
- User management (view, edit, delete)
- Active car monitoring with JSON inspection
- Track boundary editor with interactive map
- Server statistics and health monitoring

---

## Quick Start

### Prerequisites
- Node.js 18+
- eChook Server running

### Installation

```bash
# Clone the repository
git clone https://github.com/eChook/eChookLive.git
cd eChookLive

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your server URLs
```

### Development

```bash
# Start dev server with hot reload
npm run dev

# Run tests
npm run test

# Run tests with UI
npm run test:ui
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Configuration

Create a `.env` file in the project root:

```env
VITE_API_URL=https://your-server.com
VITE_WS_URL=wss://your-server.com
```

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | REST API base URL | `http://localhost:3000` |
| `VITE_WS_URL` | WebSocket server URL | `ws://localhost:3000` |

---

## Project Structure

```
src/
├── assets/              # Static assets (images, fonts)
├── components/          # Vue components
│   ├── tabs/            # Tab panel components
│   └── ui/              # Reusable UI components
├── composables/         # Vue composables
│   ├── useChartZoom.js  # Chart zoom state
│   ├── useHistory.js    # History fetching
│   ├── useSocket.js     # WebSocket management
│   └── useToast.js      # Toast notifications
├── router/              # Vue Router configuration
├── stores/              # Pinia stores
│   ├── admin.js         # Admin panel state
│   ├── auth.js          # Authentication state
│   ├── settings.js      # User preferences
│   ├── spectator.js     # Spectator mode state
│   └── telemetry.js     # Core telemetry data
├── utils/               # Utility functions
│   ├── formatting.js    # Value formatting
│   ├── raceAnalytics.js # Race/lap detection
│   ├── telemetryKeys.js # Key metadata
│   └── unitConversions.js # Unit scaling
└── views/               # Page-level components
    ├── DashboardView.vue
    ├── LoginView.vue
    ├── RegisterView.vue
    └── SpectatorView.vue
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Cycle between Graph / Map / Laps tabs |
| `Space` | Pause / Resume live data |
| `L` | Unlock chart zoom (return to live) |
| `R` | Zoom to current race |
| `1-9` | Zoom to specific lap |
| `←` `→` | Pan chart left/right |
| `+` `-` | Zoom in/out |
| `?` | Show keyboard shortcuts help |

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Vue 3 (Composition API) |
| Build Tool | Vite 7 |
| State | Pinia with persistence |
| Routing | Vue Router 4 |
| Charts | ECharts 6 |
| Maps | Leaflet + OpenStreetMap |
| WebSocket | Socket.IO Client |
| UI | Tailwind CSS + HeadlessUI |
| Icons | Heroicons |
| Testing | Vitest |

---

## API Requirements

This frontend requires an eChook Server backend with:

- REST API for authentication and history
- WebSocket (Socket.IO) for real-time data
- MessagePack encoding for efficient data transfer

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

