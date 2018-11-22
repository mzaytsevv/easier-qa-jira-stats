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
            if(chunk.length > 0){
                let loadedChunk = await loadChunk(chunk, type);
                result = result.concat(loadedChunk);
            }
            break;
        }
    }
    return result;
};
const loadChunk = async (keysChunk, type) => {
    return new Promise((resolve, reject)=>{
        let query = format("issuetype = '{type}'  and key in ({keysChunk})", {keysChunk : keysChunk.join(', '), type: type});
        let result = [];
        jira.searchJira(query, { maxResults : 5000, fields: ["created", "reporter", "summary", "status", "assignee", "issuelinks", "customfield_21801"] }, function(error, body) {
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
                    issue.reporter = (issues[i].fields.reporter)? issues[i].fields.reporter.displayName : "";
                    issue.reporterKey = (issues[i].fields.reporter)? issues[i].fields.reporter.key : "";
                    issue.created = issues[i].fields.created;
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
                        summary: link.outwardIssue.fields.summary,
                        reporter: link.outwardIssue.fields
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
                        summary: link.inwardIssue.fields.summary,
                        reporter: link.inwardIssue.fields
                    });
                }
            }
        }
    }
    return result;
};
const getSprintName = (field) => {
    //field contains the string: com.atlassian.greenhopper.service.sprint.Sprint@2be3269a[id=3258,rapidViewId=1357,state=ACTIVE,name=Sensage Sprint 4,startDate=2018-08-06T09:03:38.995Z,endDate=2018-08-12T09:03:00.000Z,completeDate=<null>,sequence=3258,goal=]
    //need to parse it and return "Sensage Sprint 4"
    //looking only for active sprint
    let res = "";
    if(field !== null && field.length > 0){
        for(let i = 0; i < field.length; i++){
            if(field[i].indexOf("state=ACTIVE") > 0){
                let splitted = field[i].split("name=");
                if(splitted.length > 1){
                    if(splitted[1].indexOf(",") > 0){
                        res = splitted[1].substring(0, splitted[1].indexOf(","));
                    }
                }
            }
        }
    }
    return res;
};
const getRelatedIssueKeys = (easierTests, field) => {
    let result = {};
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        for(let j = 0; j < easierTest[[field]].length; j++){
            let issue = easierTest[field][j];
            if(!(issue.key in result)){
                result[issue.key] = '';
            }
        }
    }
    return Object.keys(result);
};
const mix = (easierTests, screens, defects, defects1) => {
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
                    screen.reporter = screens[k].reporter;
                    screen.created = screens[k].created;
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
                    defect.reporter = defects[k].reporter;
                    defect.created = defects[k].created;
                    easierTest.defects[j] = defect;
                }
            }
        }
        for(let j = 0; j < easierTest.defects1.length; j++){
            let defect1 = easierTest.defects1[j];
            for(let k = 0; k < defects1.length; k ++){
                if(defect1.key === defects1[k].key){
                    defect1.summary = defects1[k].summary;
                    defect1.assignee = defects1[k].assignee;
                    defect1.status = defects1[k].status;
                    defect1.platforms = defects1[k].platforms;
                    defect1.reporter = defects1[k].reporter;
                    defect1.created = defects1[k].created;
                    easierTest.defects1[j] = defect1;
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
        jira.searchJira(query, { maxResults : 5000, fields: ["resolutiondate", "resolved", "created", "summary", "status", "assignee", "issuelinks", "customfield_19201"] }, function(error, body) {
            if(error) {
                reject(error);
            }
            let total = body.total;
            let issues = body.issues;
            let easierTests = [];
            issues.forEach(issue => {
                let easierTest = {};
                easierTest.id = issue.id;
                easierTest.key = issue.key;
                easierTest.name = issue.fields.summary;
                easierTest.qa = (issue.fields.assignee)? issue.fields.assignee.displayName : "";
                easierTest.status = issue.fields.status.name;
                easierTest.resolution = (issue.fields.customfield_19201 !== null)? issue.fields.customfield_19201.value : "";
                easierTest.screens = getLinkedTasks(issue, "Easier Story");
                easierTest.defects = getLinkedTasks(issue, "Easier Defect");
                easierTest.defects1 = getLinkedTasks(issue, "Defect");
                easierTest.resolutiondate = issue.fields.resolutiondate;
                easierTests.push(easierTest);
            });
            let screensKeys = getRelatedIssueKeys(easierTests, "screens");
            let defectsKeys = getRelatedIssueKeys(easierTests, "defects");
            let defects1Keys = getRelatedIssueKeys(easierTests, "defects1");
            loadIssuesByKeyRange(screensKeys, "Easier Story").then((screens) => {
                loadIssuesByKeyRange(defectsKeys, "Easier Defect").then((defects) => {
                    loadIssuesByKeyRange(defects1Keys, "Defect").then((defects1)=>{
                        mix(easierTests, screens, defects, defects1);
                        resolve(easierTests);
                    });
                });
            });
        });
    });
};

const loadEasierStoriesMovedFromQAtoValidation = async (config) => {
    let query = format('issuetype = "Easier Story" and status changed from "In Easier QA" to "Ready For Validation" after "{dates.start}" and status changed from "In Easier QA" to "Ready For Validation" before "{dates.end}" or status changed from "In Easier QA" to "In Code Review" after "{dates.start}" and status changed from "In Easier QA" to "In Code Review" before "{dates.end}"', config);
    return new Promise((resolve, reject) => {
        let relatedStories = [];
        let relatedDefects = [];
        let result = [];
        jira.searchJira(query, { maxResults : 5000, fields: ["created", "summary", "status", "assignee", "issuelinks"] }, function(error, body) {
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
              hasTestCases : false,
              sprint: "",
              created: "",
          };
          issue.key = data.key;
          issue.assignee = (data.fields.assignee)? data.fields.assignee.displayName : "";
          issue.sprint = getSprintName(data.fields["customfield_10001"]);
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
          issue.easierTestWritingTasks = getLinkedTasks(data, "Easier Test Writing");
          resolve(issue);
      });
  });
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

const loadEasierStoriesInStatus = async (config, status) => {
    config.status = status;
    let query = format('issuetype = "Easier Story" and labels = Eng.Easier.UniqueScreen and status = "{status}"', config);
    return new Promise((resolve, reject) => {
        let relatedStories = [];
        let relatedDefects = [];
        let result = [];
        jira.searchJira(query, { maxResults : 5000, fields: ["created", "reporter", "summary", "status", "assignee", "issuelinks"] }, function(error, body) {
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

const search = async (jql) => {
    return new Promise((resolve, reject) => {
        let result = [];
        jira.searchJira(jql, { maxResults : 5000, fields: ["resolutiondate", "created", "reporter", "summary", "status", "assignee", "issuelinks", "customfield_21801"] }, function(error, body) {
            if (error) {
                reject(error);
            }
            let issues = body.issues;
            issues.forEach(issue => {
                let obj = {};
                obj.key = issue.key;
                obj.assignee = (issue.fields.assignee)? issue.fields.assignee.displayName : "";
                obj.project = issue.key.split("-")[0];
                obj.status = issue.fields.status.name;
                obj.created = issue.fields.created;
                obj.resolutiondate = issue.fields.resolutiondate;
                obj.platforms = [];
                if(issue.fields["customfield_21801"]){
                    issue.fields["customfield_21801"].forEach(platform => {
                        obj.platforms.push(platform.value);
                    });
                }
                obj.summary = issue.fields.summary;
                obj.screens = getLinkedTasks(issue, "Easier Story");
                obj.easierDefects = getLinkedTasks(issue, "Easier Defect");
                obj.easierTests = getLinkedTasks(issue, "Easier Test");
                obj.defects = getLinkedTasks(issue, "Defect");
                obj.e2eTests = getLinkedTasks(issue, "End-to-end Test");
                obj.resolutiondate = issue.fields.resolutiondate;
                result.push(obj);
            });
            resolve(result);
        });
    });
};

module.exports = {
  init,
    loadEasierTests,
    loadEasierStoriesMovedFromQAtoValidation,
    search,
    loadIssue,
    loadIssues,
    loadEasierStoriesInStatus,
    loadIssuesByKeyRange
};