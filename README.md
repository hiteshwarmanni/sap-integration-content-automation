# sap-integration-content-automation

# For Server in Terminal 1
# cd server
# node server.js

# For Front End in Terminal 2
# cd client
# npm run dev   



# ******************** CF Login **************************

# cf login -a https://api.cf.eu10-004.hana.ondemand.com

# cf target -o IT_CF_INDIA_processautomation-oswptav8 -s dev

# After deploying, update XSUAA service instance
# cf update-service intops_xsuaa -c xs-security.json


# ******************** Deploy to cloud **************************


# deploy DB Table
# cd db
# cf push -f manifest-deploy.yml

# check if the table has been created
# cf stop db-deployer-temp
# cf delete db-deployer-temp -f
# cd ..
# -----

# Install all dependencies in client
# cd client
# npm run build
# cd ..

# Copy all dependecies to router
# xcopy /E /I /Y client\dist\* approuter\resources\

# Deploy to cloud
# cf push