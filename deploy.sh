#!/bin/bash

# IntOps - Cloud Foundry Deployment Script
# This script builds and deploys the application to Cloud Foundry

set -e  # Exit on error

echo "======================================"
echo "IntOps Cloud Foundry Deployment"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if cf CLI is installed
if ! command -v cf &> /dev/null
then
    echo -e "${RED}Error: Cloud Foundry CLI (cf) is not installed.${NC}"
    echo "Please install it from: https://docs.cloudfoundry.org/cf-cli/install-go-cli.html"
    exit 1
fi

# Check if logged in to Cloud Foundry
echo -e "${BLUE}Checking Cloud Foundry login status...${NC}"
if ! cf target &> /dev/null
then
    echo -e "${RED}Error: You are not logged in to Cloud Foundry.${NC}"
    echo "Please run: cf login"
    exit 1
fi

echo -e "${GREEN}✓ Logged in to Cloud Foundry${NC}"
cf target
echo ""

# Step 1: Install dependencies
echo -e "${BLUE}Step 1: Installing dependencies...${NC}"
npm run install-all
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 2: Build client application
echo -e "${BLUE}Step 2: Building client application...${NC}"
cd client
npm run build
cd ..
echo -e "${GREEN}✓ Client application built${NC}"
echo ""

# Step 3: Copy client build to server and approuter
echo -e "${BLUE}Step 3: Copying client build to server and approuter...${NC}"
rm -rf server/public
mkdir -p server/public
cp -r client/dist/* server/public/
echo -e "${GREEN}✓ Client build copied to server/public${NC}"

rm -rf approuter/resources
mkdir -p approuter/resources
cp -r client/dist/* approuter/resources/
echo -e "${GREEN}✓ Client build copied to approuter/resources${NC}"
echo ""

# Step 4: Deploy to Cloud Foundry
echo -e "${BLUE}Step 4: Deploying to Cloud Foundry...${NC}"
cf push

echo ""
echo -e "${GREEN}======================================"
echo "Deployment Complete!"
echo "======================================${NC}"
echo ""
echo "Your application is now deployed to Cloud Foundry."
echo ""
echo "Application URLs:"
echo "  Frontend (Approuter): https://intops-app.cfapps.eu10-004.hana.ondemand.com"
echo "  Backend (Server):     https://intops-server.cfapps.eu10-004.hana.ondemand.com"
echo ""
echo "To check application status:"
echo "  cf apps"
echo ""
echo "To view logs:"
echo "  cf logs intops-app --recent"
echo "  cf logs intops-server --recent"
echo ""