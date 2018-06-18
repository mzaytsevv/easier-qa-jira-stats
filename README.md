# easier-qa-jira-stats
Library to extract and build Easier quality statistics

# Preparation:
1. put your desirable dates range in config:
```javascript
    dates : {
        start : "2018-06-11 00:00",
        end : "2018-06-17 23:59"
    },
```
2. change output dir name:
```javascript
    outputDir : "output/Jun 11 - Jun 17"
```

# How to run:
1. npm install
2. nvm use v8.9
3. put a JIRA password in env variable typing in terminal: export JIRA_PASS=your_jira_password
4. node index.js
