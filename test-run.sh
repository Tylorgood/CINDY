#!/bin/bash

# Quick test script to verify agent initialization
# This will start the server and verify it loads

echo "Testing Personal Agent initialization..."

# Start the agent in background and capture output
timeout 10 node server.js > test-output.log 2>&1 &
PID=$!

# Wait a bit for initialization
sleep 3

# Check if process is still running
if ps -p $PID > /dev/null 2>&1; then
    echo "✓ Agent process started successfully"
    kill $PID 2>/dev/null
else
    echo "✗ Agent failed to start"
    cat test-output.log
    exit 1
fi

# Check for initialization messages
if grep -q "Personal Agent initialized" test-output.log; then
    echo "✓ Agent initialized correctly"
else
    echo "⚠ Agent initialization unclear"
    cat test-output.log
fi

# Clean up
rm -f test-output.log

echo ""
echo "Test complete. To run properly, configure .env with your credentials."