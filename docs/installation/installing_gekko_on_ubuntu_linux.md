# Install GreenGekko on Ubuntu Linux

On discord chat (https://discord.gg/26wMygt), where users are helping each other, @marty#4491 contributed this guide on how to install GreenGekko on ubuntu linux (using Google Cloud or Azure services)

## References
GreenGekko on GitHub (https://github.com/mark-sch/GreenGekko)
Install PostgreSQL (https://computingforgeeks.com/install-postgresql-12-on-ubuntu/)

### GreenGekko Installation

1. Create a virtual machine on Google Cloud compute (Ubuntu 19.10) or Azure (18.04 LTS)
2. Enable ssh and connect via putty (or not)
3. Install git if required (sudo apt install git)
4. sudo apt update
5. Install build dependencies (sudo apt-get install build-essential)
6. Install npm if required (sudo apt install npm)
7. Install an updated version of node (curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -)
8. sudo apt-get install -y nodejs
9. git clone https://github.com/mark-sch/GreenGekko
10. mv GreenGekko\ gekko\
11. cd gekko
12. Install tulip and talib (npm i talib tulind)
13. npm install
14. cd exchange
15. npm install

### Postgres Install

16. wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
17. echo "deb http://apt.postgresql.org/pub/repos/apt/ `lsb_release -cs`-pgdg main" |sudo tee  /etc/apt/sources.list.d/pgdg.list
18. sudo apt update
19. sudo apt upgrade
20. sudo apt -y install postgresql-12 postgresql-client-12
21. sudo service postgresql start

### Configure Postgres

22. sudo -u postgres psql
23. alter user postgres with password 'StrongAdminP@ssw0rd';
24. create user gekkodbuser with encrypted password '1234';
25. alter role gekkodbuser createdb;

### Other stuff to mke your life easier

24. Install pm2 (sudo npm install pm2 -g)
25. Create aliases (edit ./bashrc)
