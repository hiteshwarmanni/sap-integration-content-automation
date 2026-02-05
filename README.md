# sap-integration-content-automation


# For Front End 
# cd client
# npm run dev   


# For Server
# cd server
# node server.js
# ******************** CF Login **************************

# cf login -a https://api.cf.eu10-004.hana.ondemand.com

# cf target -o IT_CF_INDIA_processautomation-oswptav8 -s dev

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