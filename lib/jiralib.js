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
        if(keys.length > 0 && currentIndex < keys.length){
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
        jira.searchJira(query, { maxResults : 5000, fields: ["summary", "status", "assignee", "issuelinks", "customfield_21801"] }, function(error, body) {
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
                    let platforms = [];
                    if(issues[i].fields["customfield_21801"]){
                        for(let j = 0; j < issues[i].fields["customfield_21801"].length; j++){
                            let platform = issues[i].fields["customfield_21801"][j];
                            platforms.push(platform.value);
                        }
                    }
                    issue.platforms = platforms;
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
                    result.push({
                        key : link.outwardIssue.key,
                        status: link.outwardIssue.fields.status.name,
                        assignee: (link.outwardIssue.fields.assignee)? link.outwardIssue.fields.assignee.displayName : '',
                        type: link.outwardIssue.fields.issuetype.name,
                    });
                }
            }
            if(link.inwardIssue){
                if(link.inwardIssue.fields.issuetype.name === issueType){
                    result.push({
                        key : link.inwardIssue.key,
                        status: link.inwardIssue.fields.status.name,
                        assignee: (link.inwardIssue.fields.assignee)? link.inwardIssue.fields.assignee.displayName : '',
                        type: link.inwardIssue.fields.issuetype.name,
                    });
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
const getRelatedTestsKeys = (issue) => {
    let result = {};
    for(let i = 0; i < issue.easierTests.length; i++){
        let easierTest = issue.easierTests[i];
        if(!(easierTest.key in result)){
            result[easierTest.key] = '';
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
                    defect.platforms = defects[k].platforms;
                    easierTest.defects[j] = defect;
                }
            }
        }
    }
    return easierTests;
};
const loadEasierTests = async (config) => {
    let query = format("issuetype='Easier Test' and  status=closed and resolutiondate is not empty and resolutiondate >= '{dates.start}' and resolutiondate <= '{dates.end}'", config);
    // let query = format("issuetype='Easier Test' and  status=closed and project = 'AES CIS'", config);
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
                easierTest.id = issues[i].id;
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
    let query = format('issuetype = "Easier Story" and status changed from "In Easier QA" to "Ready For Validation" after "{dates.start}" and status changed from "In Easier QA" to "Ready For Validation" before "{dates.end}" and assignee = ibotezatu or status changed from "In Easier QA" to "Code Review" after "{dates.start}" and status changed from "In Easier QA" to "Ready For Validation" before "{dates.end}"', config);
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
                obj.easierTests = getLinkedTasks(issue, "Easier Test");
                result.push(obj);
            }
            resolve(result);
        });
    });
};

const loadIssue = async (id) => {
    //needs to use uri: this.makeUri('/issue/' + issueNumber + "?expand=changelog"), in jira lib findIssue function.
  //  no time to form so just changed it there, it would be dropped after of module reimport.
  console.log("Load issue : " + id);
  return new Promise((resolve, reject) => {
      jira.findIssue(id, function(error, data){
          if(error){
              reject(error);
          }
          let issue = {
              assignee: "",
              key: "",
              acceptedDateTime: "",
              closedDateTime: "",
              inDevelopmentDateTime: "",
              inEasierQADateTime: "",
              easierTests: [],
              hasTestCases : false
          };
          issue.key = data.key;
          issue.assignee = (data.fields.assignee)? data.fields.assignee.displayName : "";
          if(data.changelog){
              if(data.changelog.histories){
                  for(let i = 0; i < data.changelog.histories.length; i++){
                      let historyRecord = data.changelog.histories[i];
                      if(historyRecord.items){
                          for(let i = 0; i < historyRecord.items.length; i++){
                              let historyItem = historyRecord.items[i];
                              if(historyItem.field === "status"
                                  && historyItem.fromString === "New"
                                  && historyItem.toString === "Accepted"){
                                  issue.acceptedDateTime = historyRecord.created;
                              }
                              if(historyItem.field === "status"
                                  && historyItem.fromString === "Accepted"
                                  && historyItem.toString === "Closed"){
                                  issue.closedDateTime = historyRecord.created;
                              }
                              if(historyItem.field === "status"
                                  && historyItem.fromString === "Backlog"
                                  && historyItem.toString === "In Development"){
                                  issue.inDevelopmentDateTime = historyRecord.created;
                              }
                              if(historyItem.field === "status"
                                  && historyItem.fromString === "In Development"
                                  && historyItem.toString === "In Easier QA"){
                                  issue.inEasierQADateTime = historyRecord.created;
                              }
                          }
                      }
                  }
              }
          }
          issue.easierTests = getLinkedTasks(data, "Easier Test");
          issue.hasTestCases = checkForTestCases(data);
          resolve(issue);
      });
  });
};

const checkForTestCases = (data) => {
  let hasTestCases = false;
  if(data.fields.subtasks){
      for(let i = 0; i < data.fields.subtasks.length; i++){
          let subtask = data.fields.subtasks[i];
          let summary = (subtask.fields.summary)? subtask.fields.summary : "";
          summary = summary.toLowerCase();
          let pattern1 = "easier qa";
          let pattern2 = "test writing";
          if(summary.indexOf(pattern1) >= 0 && summary.indexOf(pattern2) >= 0){
              hasTestCases = true;
              break;
          }
      }
  }
  return hasTestCases;
};

const loadIssues = async (ids) => {
    let issues = [];
    for(let i = 0; i < ids.length; i++){
        let id = ids[i];
        issues.push(await loadIssue(id));
    }
    return new Promise((resolve, reject) => {
        resolve(issues);
    });
};

const loadEasierStoriesInQANow = async (config, status) => {
    config.status = status;
    let query = format('issuetype = "Easier Story" and labels = Eng.Easier.UniqueScreen and status = "{status}"', config);
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
                    id: "",
                    key: "",
                    project: "",
                    assignee: "",
                };
                obj.id = issue.id;
                obj.key = issue.key;
                obj.assignee = (issue.fields.assignee)? issue.fields.assignee.displayName : "";
                obj.project = issue.key.split("-")[0];
                result.push(obj);
            }
            resolve(result);
        });
    });
};

module.exports = {
  init,
    loadEasierTests,
    loadEasierStoriesMovedFromQAtoValidation,
    loadIssue,
    loadIssues,
    loadEasierStoriesInQANow
};