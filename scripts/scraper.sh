#!/bin/bash
echo "Starting Scraper Service..."
cd "$(dirname "$0")/../server/scraper"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Creating one..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies if needed
pip install -r requirements.txt 2>/dev/null || echo "Installing dependencies..."

# Start scraper service
python main.py
