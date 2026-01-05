#!/usr/bin/env python3
"""
Entry point for PyInstaller bundle.

This script properly initializes the package context before running the server.
"""

import sys
import os

def main():
    # Ensure we can find our modules
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller bundle
        base_path = sys._MEIPASS
    else:
        # Running as script
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    # Add base path to sys.path if not already there
    if base_path not in sys.path:
        sys.path.insert(0, base_path)
    
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description='Bildvisare Backend Server')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=5001, help='Port to bind to')
    args = parser.parse_args()
    
    # Set port in environment for the app
    os.environ['BILDVISARE_PORT'] = str(args.port)
    
    # Import and run uvicorn
    import uvicorn
    uvicorn.run(
        'api.server:app',
        host=args.host,
        port=args.port,
        log_level='info'
    )

if __name__ == '__main__':
    main()
