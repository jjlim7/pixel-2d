#!/bin/bash

# Run node server.js in the background
node server.js &

# Run webpack in production mode in the background
npm run dev &

# Wait for all background processes to complete (optional)
wait
