#!/bin/bash

# Run node server.js in the background
node server.js &

# Run webpack in production mode in the background
webpack --mode production &

# Wait for all background processes to complete (optional)
wait
