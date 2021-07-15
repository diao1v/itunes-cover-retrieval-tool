# This is the base image you gonna use
# node(this is the image name):14(this is the version name)
FROM node:14

# Create app directory in the image
RUN mkdir -p /app
#set the work directory so no need to 
#direct to this directory repeatlly
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

#set the listioning port
EXPOSE 8000

#this is the cmd line when run the app
CMD [ "node", "app.js" ]