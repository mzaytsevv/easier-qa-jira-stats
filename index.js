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
        start : "2018-06-11 00:00",
        end : "2018-06-17 23:59"
    },
    outputDir : "output/Jun 11 - Jun 17/"
};

const mkdir = async (name) => {
    return makeDir(name);
};
const makeLink = (str) => {
    return format('=HYPERLINK("https://jira.devfactory.com/browse/{key}","{key}")', {key : str});
};
const rawData = (easierTests, period) => {
    let result  = [];
    result.push("Period;QA name;Easier Test;Screen Related;Project;Dev name;Resolution;Pass rate;Defects;");
    for(let i = 0; i < easierTests.length; i ++ ){
        let easierTest = easierTests[i];
        let lineObj = {};
        lineObj.period = period;
        lineObj.period = period;
        lineObj.qa = easierTest.qa;
        lineObj.key = easierTest.key;
        lineObj.project = lineObj.key.split('-')[0];
        lineObj.resolution = easierTest.resolution;
        lineObj.developer = "";
        lineObj.passRate = "";
        lineObj.screenRelated = "";
        if(easierTest.screens.length > 0){
            lineObj.developer = easierTest.screens[0].assignee;
            lineObj.screenRelated = easierTest.screens[0].key;
            lineObj.passRate = (easierTest.resolution === "Passed")? easierTest.screens[0].easierTests.length : "";
        }
        lineObj.defects = [];
        for(let j = 0; j < easierTest.defects.length; j++){
            let defect = easierTest.defects[j];
            lineObj.defects.push(defect.key);
        }
        lineObj.defects = lineObj.defects.join(" ");
        lineObj.key = makeLink(lineObj.key);
        lineObj.screenRelated = makeLink(lineObj.screenRelated);
        let line = format("{period};{qa};{key};{screenRelated};{project};{developer};{resolution};{passRate};{defects};", lineObj);
        result.push(line);
    }
    return result.join("\n");
};
const save = async (filename, data) => {
    return new Promise((resolve, reject) => {
        writeFile(filename, data, function(err) {
            if (err) reject(err);
            resolve();
        });
    });
};
const defectsPerProject = (easierTests, period) => {
    let obj = {};
    let result = [];
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        let relatedProject = "";
        if(easierTest.screens.length > 0){
            if(easierTest.screens[0].key){
                relatedProject = easierTest.screens[0].key.split("-")[0];
                if(!(relatedProject in obj)){
                    obj[relatedProject] = {};
                }
                if(obj[relatedProject].defectsCounter){
                    obj[relatedProject].defectsCounter += easierTest.defects.length;
                } else {
                    obj[relatedProject].defectsCounter  = easierTest.defects.length;
                }
            }
        }
    }
    let keys = Object.keys(obj);
    result.push("Period;Project name;Defects found;");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.period = period;
        lineObj.projectName = keys[i];
        lineObj.defectsNumber = obj[keys[i]].defectsCounter;
        result.push(format("{period};{projectName};{defectsNumber};", lineObj));
    }
    return result.join("\n");
};
const defectsPerDeveloper = (easierTests, period) => {
    let obj = {};
    let result = [];
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        let developer = "";
        if(easierTest.screens.length > 0){
            if(easierTest.screens[0].key){
                developer = easierTest.screens[0].assignee;
                if(!(developer in obj)){
                    obj[developer] = {
                        sentToQA : 0,
                        defectsCounter : 0
                    };
                }
                obj[developer].sentToQA ++;
                obj[developer].defectsCounter += easierTest.defects.length;
            }
        }
    }
    let keys = Object.keys(obj);
    result.push("Period;Developer name;Sent to QA;Defects found;");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.period = period;
        lineObj.developer = keys[i];
        lineObj.sentToQA = obj[keys[i]].sentToQA;
        lineObj.defectsNumber = obj[keys[i]].defectsCounter;
        result.push(format("{period};{developer};{sentToQA};{defectsNumber};", lineObj));
    }
    return result.join("\n");
};
const passRatePerProject = (easierTests, period) => {
    let obj = {};
    let result = [];
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        let relatedProject = "";
        let relatedScreen = "";
        if(easierTest.screens.length > 0){
            if(easierTest.screens[0].key){
                relatedScreen = easierTest.screens[0];
                relatedProject = easierTest.screens[0].key.split("-")[0];
                if(!(relatedProject in obj)){
                    obj[relatedProject] = {
                        sentToQA : 0,
                        passed : 0,
                        passedFirstTime : 0,
                    };
                }
                obj[relatedProject].sentToQA ++;
                if(easierTest.resolution === "Passed"){
                    obj[relatedProject].passed ++;
                    if(relatedScreen.easierTests.length === 1){
                        obj[relatedProject].passedFirstTime ++;
                    }
                }
            }
        }
    }
    let keys = Object.keys(obj);
    result.push("Period;Project name;Sent to QA;Passed;First time passed;");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.period = period;
        lineObj.project = keys[i];
        lineObj.sentToQA = obj[keys[i]].sentToQA;
        lineObj.passed = obj[keys[i]].passed;
        lineObj.passedFirstTime = obj[keys[i]].passedFirstTime;
        result.push(format("{period};{project};{sentToQA};{passed};{passedFirstTime};", lineObj));
    }
    return result.join("\n");
};
const passRatePerDeveloper = (easierTests, period) => {
    let obj = {};
    let result = [];
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        let relatedProject = "";
        let relatedScreen = "";
        let relatedDeveloper = "";
        if(easierTest.screens.length > 0){
            if(easierTest.screens[0].key){
                relatedDeveloper = easierTest.screens[0].assignee;
                relatedScreen = easierTest.screens[0];
                if(!(relatedDeveloper in obj)){
                    obj[relatedDeveloper] = {
                        sentToQA : 0,
                        passed : 0,
                        passedFirstTime : 0
                    };
                }
                obj[relatedDeveloper].sentToQA ++;
                if(easierTest.resolution === "Passed"){
                    obj[relatedDeveloper].passed ++;
                    if(relatedScreen.easierTests.length === 1){
                        obj[relatedDeveloper].passedFirstTime ++;
                    }
                }
            }
        }
    }
    let keys = Object.keys(obj);
    result.push("Period;Project name;Sent to QA;Passed;First time passed;");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.period = period;
        lineObj.project = keys[i];
        lineObj.sentToQA = obj[keys[i]].sentToQA;
        lineObj.passed = obj[keys[i]].passed;
        lineObj.passedFirstTime = obj[keys[i]].passedFirstTime;
        result.push(format("{period};{project};{sentToQA};{passed};{passedFirstTime};", lineObj));
    }
    return result.join("\n");
};
const defectsFoundPerQA = (easierTests, period) => {
    let result = [];
    let obj = {};
    for(let i = 0; i < easierTests.length; i ++) {
        let easierTest = easierTests[i];
        let qa =  easierTest.qa;
        if(!obj[qa]){
            obj[qa] = {
                testsExecuted : 0,
                defectsFound : 0
            }
        }
        obj[qa].testsExecuted ++;
        obj[qa].defectsFound += easierTest.defects.length;
    }
    let keys = Object.keys(obj);
    result.push("Period;QA name;Tests executed;Defects found;");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.period = period;
        lineObj.qa = keys[i];
        lineObj.testsExecuted = obj[keys[i]].testsExecuted;
        lineObj.defectsFound = obj[keys[i]].defectsFound;
        result.push(format("{period};{qa};{testsExecuted};{defectsFound};", lineObj));
    }
    return result.join('\n');
};
const cancelledDefectsPerQA = (easierTests, period) => {
    let result = [];
    let obj = {};
    for(let i = 0; i < easierTests.length; i ++) {
        let easierTest = easierTests[i];
        let qa =  easierTest.qa;
        if(!obj[qa]){
            obj[qa] = {
                defectsFound : 0,
                cancelledDefects : 0
            }
        }
        obj[qa].defectsFound += easierTest.defects.length;
        for(let j = 0; j < easierTest.defects.length; j ++){
            let easierDefect = easierTest.defects[j];
            if(easierDefect.status === "Cancelled"){
                obj[qa].cancelledDefects ++;
            }
        }
    }
    let keys = Object.keys(obj);
    result.push("Period;QA name;Defects found;Cancelled defects");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.period = period;
        lineObj.qa = keys[i];
        lineObj.defectsFound = obj[keys[i]].defectsFound;
        lineObj.cancelledDefects = obj[keys[i]].cancelledDefects;
        result.push(format("{period};{qa};{defectsFound};{cancelledDefects};", lineObj));
    }
    return result.join('\n');
};

const qualityRankPerProject = (issues, period) => {
    let result = [];
    let obj = {};
    for(let i = 0; i < issues.length; i ++ ) {
        let issue = issues[i];
        let project = issue.project;
        if(!obj[project]){
            obj[project] = {
                tasks : 0,
                defects : 0,
                rate : -1
            };
        }
        obj[project].tasks ++;
        obj[project].defects += issue.defects.length;
        obj[project].rate = (obj[project].defects / obj[project].tasks).toFixed(2);
    }
    let keys = Object.keys(obj);
    result.push("Period;Project name;Quality rate;");
    for(let i = 0; i < keys.length; i++) {
        let lineObj = {};
        lineObj.period = period;
        lineObj.project = keys[i];
        lineObj.rate = obj[keys[i]].rate;
        result.push(format("{period};{project};{rate}", lineObj));
    }
    return result.join('\n');
};
const qualityRankPerDeveloper = (issues, period) => {
    let result = [];
    let obj = {};
    for(let i = 0; i < issues.length; i ++ ) {
        let issue = issues[i];
        let developer = issue.developer;
        if(!obj[developer]){
            obj[developer] = {
                tasks : 0,
                defects : 0,
                rate : -1
            };
        }
        obj[developer].tasks ++;
        obj[developer].defects += issue.defects.length;
        obj[developer].rate = (obj[developer].defects / obj[developer].tasks).toFixed(2);
    }
    let keys = Object.keys(obj);
    result.push("Period;Developer name;Quality rate;");
    for(let i = 0; i < keys.length; i++) {
        let lineObj = {};
        lineObj.period = period;
        lineObj.developer = keys[i];
        lineObj.rate = obj[keys[i]].rate;
        result.push(format("{period};{developer};{rate}", lineObj));
    }
    return result.join('\n');
};
const run = async () => {
    await jiraLib.init(config);
    await mkdir(config.outputDir);
    let period = config.dates.start + " - " + config.dates.end;
    let easierTests = await jiraLib.loadEasierTests(config);
    let testedScreens = await jiraLib.loadEasierStoriesMovedFromQAtoValidation(config);
    await save(config.outputDir + "project-quality-rank.csv", qualityRankPerProject(testedScreens, period));
    await save(config.outputDir + "developers-quality-rank.csv", qualityRankPerDeveloper(testedScreens, period));
    await save(config.outputDir + "raw-data.csv", rawData(easierTests, period));
    await save(config.outputDir + "defects-per-project.csv", defectsPerProject(easierTests, period));
    await save(config.outputDir + "defects-per-developer.csv", defectsPerDeveloper(easierTests, period));
    await save(config.outputDir + "pass-rate-per-project.csv", passRatePerProject(easierTests, period));
    await save(config.outputDir + "pass-rate-per-developer.csv", passRatePerDeveloper(easierTests, period));
    await save(config.outputDir + "defects-found-per-qa.csv", defectsFoundPerQA(easierTests, period));
    await save(config.outputDir + "cancelled-defects-per-qa.csv", cancelledDefectsPerQA(easierTests, period));
};

run();
