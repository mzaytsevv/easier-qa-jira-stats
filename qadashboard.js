const format = require('string-format');
const makeDir = require('make-dir');
const jiraLib = require('./lib/jiralib');
const writeFile = require('write');

let config = {
    host: "jira.devfactory.com",
    port: "443",
    user: "mzaytsev",
    password: process.env.JIRA_PASS,
    dates : {
        start : "2018-10-01 00:00",
        end : "2018-11-01 23:59"
    },
    outputDir : "output/temp/"
};

let easierQaTeam = [
    "imarenkov",
    "emostafa",
    "jcanavire",
    "oshukri",
    "rthiramdas",
    "ksahu",
    "mpachori",
    "tmaciel",
    "mwafik",
    "rmohan",
    "sshekhar",
    "skala",
    "rraju",
    "lushatkin",
    "vatluri"
];

const cleanCancelledTests = (issues) => {
    issues.forEach(issue => {
        let notCancelledEasierTests = [];
        issue.easierTests.forEach(easierTest => {
            if(easierTest.status.toLowerCase() === "cancelled"){
            } else {
                notCancelledEasierTests.push(easierTest);
            }
        });
        issue.easierTests = notCancelledEasierTests;
    });
    return issues;
};

const divideDefectsOnExternalAndInternal = async (issues) => {
    let getKeys = (objArray) => {
      let result = [];
      objArray.forEach(obj => {
          if(obj.key){
              result.push(obj.key);
          }
      });
      return result;
    };
    for(let i = 0; i < issues.length; i++){
        let issue = issues[i];
        issue.externalDefects = [];
        issue.internalDefects = [];
        let defectsKeys = getKeys(issue.defects);
        if (defectsKeys.length > 0) {
            let defects = await jiraLib.loadIssuesByKeyRange(defectsKeys, "Defect");
            defects.forEach(defect => {
                if (easierQaTeam.includes(defect.reporterKey)) {
                    issue.internalDefects.push(defect);
                } else {
                    issue.externalDefects.push(defect);
                }
            });

        }
    }
    return issues;
};

const makeLink = (str) => {
    return format('=HYPERLINK("https://jira.devfactory.com/browse/{key}","{key}")', {key : str});
};

const log = (issues) => {
    console.log("key;project;assignee;easierTestsNumber;easierDefectsNumber;internalDefectsNumber;externalDefectsNumber");
    issues.forEach(issue => {
        let obj = {
            key : makeLink(issue.key),
            project : issue.project,
            assignee : issue.assignee,
            easierTestsNumber : issue.easierTests.length,
            easierDefectsNumber : issue.easierDefects.length,
            internalDefectsNumber : issue.internalDefects.length,
            externalDefectsNumber : issue.externalDefects.length
        };
        console.log(format("{key};{project};{assignee};{easierTestsNumber};{easierDefectsNumber};{internalDefectsNumber};{externalDefectsNumber}", obj));
    });
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}



const run = async () => {
    let params = {
        from : "2018-11-01 00:00",
        to: "2018-11-22 23:59"
    };
    await jiraLib.init(config);
    let jql = format("issuetype='Easier Story' and labels='Eng.Easier.UniqueScreen' and status != Cancelled and resolutiondate >= '{from}' and resolutiondate < '{to}'", params);
    let issues = await jiraLib.search(jql);
    console.log('search done');
    issues = await cleanCancelledTests(issues);
    console.log('cancelled easier tests cleaning done');
    issues = await divideDefectsOnExternalAndInternal(issues);
    console.log('defects manipulations done');
    log(issues);
};

try {
    run();
} catch (e) {
    console.log(e);
}
