# BP UI Protect - UniFi Protect Camera Viewer

A modern web interface for viewing UniFi Protect cameras in real-time. Built with Next.js, this application provides a clean and responsive interface for monitoring your business cameras.

## Features

- Real-time camera streaming using UniFi Protect API
- Responsive web interface optimized for desktop and mobile
- Support for multiple camera formats and codecs
- Session-based authentication
- Memory monitoring and system health
- Docker containerization for easy deployment

## Getting Started

### Prerequisites

- Node.js 18+ (for local development)
- Docker and Docker Compose (for containerized deployment)
- UniFi Protect NVR or CloudKey with network access

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd bp-ui-protect
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment file and configure:
```bash
cp env.example .env.local
# Edit .env.local with your UniFi Protect settings
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Docker Deployment

#### Option 1: Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd bp-ui-protect
```

2. Copy and configure environment variables:
```bash
cp env.example .env
# Edit .env with your UniFi Protect settings
```

3. Start the application:
```bash
docker-compose up -d
```

The application will be available at `http://localhost:3000`.

#### Option 2: Using Docker directly

1. Build the Docker image:
```bash
docker build -t bp-ui-protect .
```

2. Run the container:
```bash
docker run -d \
  --name bp-ui-protect \
  -p 3000:3000 \
  -e NVR_IP=https://your-unifi-protect.local \
  -e PROTECT_USERNAME=your_username \
  -e PROTECT_PASSWORD=your_password \
  bp-ui-protect
```

### Environment Variables

Create a `.env` file (or `.env.local` for development) with the following variables:

```env
# UniFi Protect Configuration
NVR_IP=https://unifi-os.local
PROTECT_USERNAME=your_username_here
PROTECT_PASSWORD=your_password_here

# Optional
NODE_ENV=production
PORT=3000
```

**Note:** You can also configure these settings directly through the web interface when you first access the application.

### Configuration

1. **UniFi Protect Connection**: Enter your UniFi Protect NVR/CloudKey IP address or hostname
2. **Credentials**: Provide your UniFi Protect username and password
3. **Self-signed Certificates**: Enable if your UniFi Protect uses self-signed certificates

## API Endpoints

- `GET /api/env` - Get environment configuration
- `POST /api/session` - Create a new session
- `DELETE /api/session` - End current session
- `GET /api/protect/bootstrap` - Get UniFi Protect bootstrap data
- `GET /api/cameras` - List available cameras
- `GET /api/stream/[cameraId]` - Stream camera feed
- `GET /api/system/memory` - Get system memory usage

## Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Video Processing**: FFmpeg, mp4frag
- **UniFi Integration**: unifi-protect package
- **Containerization**: Docker, Docker Compose

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [UniFi Protect API Documentation](https://github.com/hjdhjd/unifi-protect)

## Troubleshooting

### Common Issues

1. **Connection Failed**: Ensure your UniFi Protect NVR is accessible from the application
2. **Self-signed Certificate**: Enable "Allow self-signed TLS" in the connection settings
3. **Camera Not Found**: Verify the camera ID and that the camera is online in UniFi Protect
4. **Stream Issues**: Check that FFmpeg is properly installed in the container

### Docker Logs

To view application logs:
```bash
docker-compose logs -f bp-ui-protect
```

### Health Check

The application includes a health check endpoint at `/api/env` that Docker uses to monitor the application status.
