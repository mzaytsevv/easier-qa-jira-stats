const JiraApi = require('jira').JiraApi;
const format = require('string-format');
let jira;
const init = async (config) => {
    jira = new JiraApi('https', config.host, config.port, config.user, config.password, '2');
};
const loadIssuesByKeyRange = async (keys, type) => {
    let result = [];
    let currentIndex = 0;
    let chunkSize = 25;
    let chunk = [];
    while(true){
        if(currentIndex < keys.length){
            if(chunk.length <= chunkSize){
                chunk.push(keys[currentIndex]);
                currentIndex ++;
            } else {
                let loadedChunk = await loadChunk(chunk, type);
                result = result.concat(loadedChunk);
                chunk = [];
            }
        } else {
            let loadedChunk = await loadChunk(chunk, type);
            result = result.concat(loadedChunk);
            break;
        }
    }
    return result;
};
const loadChunk = async (keysChunk, type) => {
    return new Promise((resolve, reject)=>{
        let query = format("issuetype = '{type}'  and key in ({keysChunk})", {keysChunk : keysChunk.join(', '), type: type});
        let result = [];
        jira.searchJira(query, { maxResults : 5000, fields: ["summary", "status", "assignee", "issuelinks"] }, function(error, body) {
            if(error) {
                reject(error);
            } else {
                let issues = body.issues;
                for(let i = 0; i < issues.length; i++){
                    let issue = {};
                    issue.key = issues[i].key;
                    issue.name = issues[i].fields.summary;
                    issue.assignee = (issues[i].fields.assignee)? issues[i].fields.assignee.displayName : "";
                    issue.status = issues[i].fields.status.name;
                    issue.easierTests = getLinkedTasks(issues[i], "Easier Test");
                    result.push(issue);
                }
            }
            resolve(result);
        });
    });
};
const getLinkedTasks = (issue, issueType) => {
    let result = [];
    if(issue.fields.issuelinks){
        for(let i = 0; i < issue.fields.issuelinks.length; i++){
            let link = issue.fields.issuelinks[i];
            if(link.outwardIssue){
                if(link.outwardIssue.fields.issuetype.name === issueType){
                    result.push({ key : link.outwardIssue.key });
                }
            }
            if(link.inwardIssue){
                if(link.inwardIssue.fields.issuetype.name === issueType){
                    result.push({ key : link.inwardIssue.key });
                }
            }
        }
    }
    return result;
};
const getRelatedScreenKeys = (easierTests) => {
    let result = {};
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        for(let j = 0; j < easierTest.screens.length; j++){
            let screen = easierTest.screens[j];
            if(!(screen.key in result)){
                result[screen.key] = '';
            }
        }
    }
    return Object.keys(result);
};
const getRelatedDefectsKeys = (easierTests) => {
    let result = {};
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        for(let j = 0; j < easierTest.defects.length; j++){
            let screen = easierTest.defects[j];
            if(!(screen.key in result)){
                result[screen.key] = '';
            }
        }
    }
    return Object.keys(result);
};
const mix = (easierTests, screens, defects) => {
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        for(let j = 0; j < easierTest.screens.length; j++){
            let screen = easierTest.screens[j];
            for(let k = 0; k < screens.length; k ++){
                if(screen.key === screens[k].key){
                    screen.summary = screens[k].summary;
                    screen.assignee = screens[k].assignee;
                    screen.status = screens[k].status;
                    screen.easierTests = screens[k].easierTests;
                    easierTest.screens[j] = screen;
                }
            }

        }
        for(let j = 0; j < easierTest.defects.length; j++){
            let defect = easierTest.defects[j];
            for(let k = 0; k < defects.length; k ++){
                if(defect.key === defects[k].key){
                    defect.summary = defects[k].summary;
                    defect.assignee = defects[k].assignee;
                    defect.status = defects[k].status;
                    easierTest.defects[j] = defect;
                }
            }
        }
    }
    return easierTests;
};
const loadEasierTests = async (config) => {
    let query = format("issuetype='Easier Test' and  status=closed and resolutiondate is not empty and resolutiondate >= '{dates.start}' and resolutiondate <= '{dates.end}'", config);
    return new Promise((resolve, reject) => {
        let relatedStories = [];
        let relatedDefects = [];
        jira.searchJira(query, { maxResults : 5000, fields: ["summary", "status", "assignee", "issuelinks", "customfield_19201"] }, function(error, body) {
            if(error) {
                reject(error);
            }
            let total = body.total;
            let issues = body.issues;
            let easierTests = [];
            for(let i = 0; i < issues.length; i++){
                let easierTest = {};
                easierTest.key = issues[i].key;
                easierTest.name = issues[i].fields.summary;
                easierTest.qa = (issues[i].fields.assignee)? issues[i].fields.assignee.displayName : "";
                easierTest.status = issues[i].fields.status.name;
                easierTest.resolution = (issues[i].fields.customfield_19201 !== null)? issues[i].fields.customfield_19201.value : "";
                easierTest.screens = getLinkedTasks(issues[i], "Easier Story");
                easierTest.defects = getLinkedTasks(issues[i], "Easier Defect");
                easierTests.push(easierTest);
            }
            let screensKeys = getRelatedScreenKeys(easierTests);
            let defectsKeys = getRelatedDefectsKeys(easierTests);
            loadIssuesByKeyRange(screensKeys, "Easier Story").then((screens) => {
                loadIssuesByKeyRange(defectsKeys, "Easier Defect").then((defects) => {
                    mix(easierTests, screens, defects);
                    resolve(easierTests);
                });
            });
        });
    });
};

const loadEasierStoriesMovedFromQAtoValidation = async (config) => {
    let query = format('issuetype = "Easier Story" and status changed from "In Easier QA" to "Ready For Validation" after "{dates.start}" and status changed from "In Easier QA" to "Ready For Validation" before "{dates.end}"', config);
    return new Promise((resolve, reject) => {
        let relatedStories = [];
        let relatedDefects = [];
        let result = [];
        jira.searchJira(query, { maxResults : 5000, fields: ["summary", "status", "assignee", "issuelinks"] }, function(error, body) {
            if (error) {
                reject(error);
            }
            let issues = body.issues;
            for(let i = 0; i < issues.length; i++){
                let issue = issues[i];
                let obj = {
                    key : "",
                    project : "",
                    developer : "",
                    defects : []
                };
                obj.key = issue.key;
                obj.developer = (issue.fields.assignee)? issue.fields.assignee.displayName : "";
                obj.project = issue.key.split("-")[0];
                obj.defects = getLinkedTasks(issue, "Easier Defect");
                result.push(obj);
            }
            resolve(result);
        });
    });
};

module.exports = {
  init, loadEasierTests, loadEasierStoriesMovedFromQAtoValidation
};