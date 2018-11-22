const format = require('string-format');
const makeDir = require('make-dir');
const jiraLib = require('./lib/jiralib');
const writeFile = require('write');
const moment = require('moment');
const excludedDefects = require('./aescis');

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

const mkdir = async (name) => {
    return makeDir(name);
};
const makeLink = (str) => {
    return format('=HYPERLINK("https://jira.devfactory.com/browse/{key}","{key}")', {key : str});
};
const rawData = (easierTests, period) => {
    let result  = [];
    result.push("Resolution Date;QA name;Easier Test;Screen Related;Project;Dev name;Resolution;Pass rate;Defects;");
    easierTests.forEach(easierTest => {
        let lineObj = {};
        lineObj.resolutiondate = easierTest.resolutiondate;
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
        easierTest.defects.forEach(defect => {
            lineObj.defects.push(defect.key);
        });
        easierTest.defects1.forEach(defect => {
            lineObj.defects.push("R:" + defect.key);
        });
        lineObj.defects = lineObj.defects.join(" ");
        lineObj.key = makeLink(lineObj.key);
        lineObj.screenRelated = makeLink(lineObj.screenRelated);
        let line = format("{resolutiondate};{qa};{key};{screenRelated};{project};{developer};{resolution};{passRate};{defects};", lineObj);
        result.push(line);
    });
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
const defectsPerProject = (easierTests, dates) => {
    let obj = {};
    let startDate = Date.parse(dates.start);
    let endDate = Date.parse(dates.end);
    let result = [];
    for(let i = 0; i < easierTests.length; i++){
        let easierTest = easierTests[i];
        let relatedProject = "";
        if(easierTest.screens.length > 0){
            if(easierTest.screens[0].key){
                relatedProject = easierTest.screens[0].key.split("-")[0];
                if(!(relatedProject in obj)){
                    obj[relatedProject] = {};
                    obj[relatedProject].defectsCounter = 0;
                }
                let uniqueEasierDefects = getCreatedInRange(getUnique(getNotExcluded(getNotCancelled(easierTest.defects))), startDate, endDate);
                let uniqueDefects = getCreatedInRange(getUnique(getNotExcluded(getNotCancelled(easierTest.defects1))), startDate, endDate);
                obj[relatedProject].defectsCounter += uniqueEasierDefects.length + uniqueDefects.length;
            }
        }
    }
    let keys = Object.keys(obj);
    result.push("Project name;Defects found;");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.projectName = keys[i];
        lineObj.defectsNumber = obj[keys[i]].defectsCounter;
        result.push(format("{projectName};{defectsNumber};", lineObj));
    }
    return result.join("\n");
};
const getCreatedInRange = (issues, startDate, endDate) =>{
    let result = [];
    issues.forEach(issue => {
        if(createdInRange(issue)){
            result.push(issue);
        }
    });
    return result;
}
const defectsPerDeveloper = (easierTests, dates) => {
    let obj = {};
    let startDate = Date.parse(dates.start);
    let endDate = Date.parse(dates.end);
    let result = [];
    easierTests.forEach(easierTest => {
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
                let unique
                obj[developer].defectsCounter += getUnique(getNotExcluded(getNotCancelled(easierTest.defects))).length;
            }
        }

    });
    let keys = Object.keys(obj);
    result.push("Developer name;Sent to QA;Defects found;");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.developer = keys[i];
        lineObj.sentToQA = obj[keys[i]].sentToQA;
        lineObj.defectsNumber = obj[keys[i]].defectsCounter;
        result.push(format("{developer};{sentToQA};{defectsNumber};", lineObj));
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
    result.push("Period;Developer name;Sent to QA;Passed;First time passed;");
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
const createdInRange = (issue, startDate, endDate) => {
    return Date.parse(issue.created) >= startDate && Date.parse(issue.created) <= endDate;
};
const defectsFoundPerQA = (easierTests, dates) => {
    //filter defects created earlier
    //filter defects linked to that test but created by different qa
    let startDate = Date.parse(dates.start);
    let endDate = Date.parse(dates.end);
    let result = [];
    let obj = {};
    easierTests.forEach(easierTest => {
        let qa =  easierTest.qa;
        if(!obj[qa]){
            obj[qa] = {
                testsExecuted : 0,
                easierDefectsFound : [],
                defectsFound : []
            }
        }
        obj[qa].testsExecuted ++;
        easierTest.defects.forEach((value) => {
            if(value.reporter === qa && createdInRange(value, startDate, endDate)){
                obj[qa].easierDefectsFound.push(value);
            }
        });
        easierTest.defects1.forEach((value) => {
            if(value.reporter === qa && createdInRange(value, startDate, endDate)){
                obj[qa].defectsFound.push(value);
            }
        });

    });
    result.push("Period;QA name;Tests executed;Defects found;");
    for(let qa in obj){
        let lineObj = {};
        lineObj.period = dates.start + " - " + dates.end;
        lineObj.qa = qa;
        lineObj.testsExecuted = obj[qa].testsExecuted;
        lineObj.defectsFound = getUnique(obj[qa].defectsFound).length  + getUnique(obj[qa].easierDefectsFound).length;
        result.push(format("{period};{qa};{testsExecuted};{defectsFound};", lineObj));
    }
    return result.join('\n');
};
const cancelledDefectsPerQA = (easierTests, dates) => {
    let result = [];
    let obj = {};
    let startDate = Date.parse(dates.start);
    let endDate = Date.parse(dates.end);
    easierTests.forEach(easierTest => {
        let qa =  easierTest.qa;
        if(!obj[qa]){
            obj[qa] = {
                defectsFound : 0,
                cancelledDefects : 0
            }
        }
        let uniqueDefects = getUnique(easierTest.defects);
        obj[qa].defectsFound += uniqueDefects.length; //looking only for Easier Defects, Defects don't have cancel state
        uniqueDefects.forEach(easierDefect => {
            if(easierDefect.reporter === qa &&
                createdInRange(easierDefect, startDate, endDate) &&
                easierDefect.status === "Cancelled"){
                obj[qa].cancelledDefects ++;
            }
        });
    });
    let keys = Object.keys(obj);
    result.push("QA name;Defects found;Cancelled defects");
    for(let i = 0; i < keys.length; i++){
        let lineObj = {};
        lineObj.qa = keys[i];
        lineObj.defectsFound = obj[keys[i]].defectsFound;
        lineObj.cancelledDefects = obj[keys[i]].cancelledDefects;
        result.push(format("{qa};{defectsFound};{cancelledDefects};", lineObj));
    }
    return result.join('\n');
};

const defectsRankPerProject = (issues, period) => {
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
        obj[project].defects += getUnique(getNotExcluded(getNotCancelled(issue.defects))).length;
        obj[project].rate = (obj[project].defects / obj[project].tasks).toFixed(2);
    }
    let keys = Object.keys(obj);
    result.push("Period;Project name;Quality rate;");
    for(let i = 0; i < keys.length; i++) {
        let lineObj = {};
        lineObj.period = period;
        lineObj.project = keys[i];
        lineObj.rate = obj[keys[i]].rate;
        result.push(format("{period};{project};{rate};", lineObj));
    }
    return result.join('\n');
};
const defectsRankPerDeveloper = (issues, period) => {
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
        obj[developer].defects += getUnique(getNotExcluded(getNotCancelled(issue.defects))).length;
        obj[developer].rate = (obj[developer].defects / obj[developer].tasks).toFixed(2);
    }
    let keys = Object.keys(obj);
    result.push("Period;Developer name;Quality rate;");
    for(let i = 0; i < keys.length; i++) {
        let lineObj = {};
        lineObj.period = period;
        lineObj.developer = keys[i];
        lineObj.rate = obj[keys[i]].rate;
        result.push(format("{period};{developer};{rate};", lineObj));
    }
    return result.join('\n');
};

const defectsPerPlatform = (issues, period) => {
    let result = [];
    let obj = {};
    issues.forEach(issue => {
        issue.defects.forEach(defect => {
            if(defect.platforms){
                defect.platforms.forEach(platform => {
                    if(!obj[platform]){
                        obj[platform] = {
                            name : platform,
                            defects : [],
                            defectsNumber : 0
                        };
                    }
                    obj[platform].defectsNumber ++;
                    obj[platform].defects.push(defect);
                });
            }
        });
    });
    result.push("Period;Platform name;Defects number; Defects list");
    for(let key in obj){
        let lineObj = {};
        lineObj.period = period;
        lineObj.platform = key;
        lineObj.defectsNumber = obj[key].defectsNumber;
        lineObj.defects = [];
        obj[key].defects.forEach(defect => {
            lineObj.defects.push(defect.key);
        });
        lineObj.defects = lineObj.defects.join(" ");
        result.push(format("{period};{platform};{defectsNumber};{defects};", lineObj));
    }

    let ipadPlatform = "Ipad Air 2 iOS 9.3 Safari latest";
    let ipadDefects = obj[ipadPlatform].defects;
    let ipadSpecificDefects = [];
    ipadDefects.forEach(ipadDefect => {
        let specific = true;
        for(let key in obj){
            if(key !== ipadPlatform){
                let defects = obj[key].defects;
                defects.forEach(defect => {
                    if(defect.key == ipadDefect){
                        specific = false;
                    }
                });
            }
        }
        if(specific){
            ipadSpecificDefects.push(ipadDefect);
        }
    });
    console.log("Ipad specific defects: ");
    ipadSpecificDefects.forEach(ipadSpecificDefect => {
       console.log(ipadSpecificDefect.key);
    });

    return result.join('\n');
};


const livingInQATimeByScreen = (expandedScreens) => {
    let result = [];
    result.push("Assignee;Screen;Moved to QA;Living in QA (hrs);Living in QA (d);Is Accepted;");
    for(let i = 0; i < expandedScreens.length; i ++ ) {
        let screen = expandedScreens[i];
        let startDate = Date.parse(screen.inEasierQADateTime);
        let endDate = new Date();
        let executionTime = Math.floor((endDate - startDate) / 60000 / 60);
        let obj = {
            assignee: screen.assignee,
            key : makeLink(screen.key),
            movedDate: moment(screen.inEasierQADateTime).format("DD.MM.YYYY HH:MM"),
            time : executionTime,
            days: executionTime / 24,
            isAccepted: false,
            acceptedBy : ''
        };
        for(let i = 0; i < screen.easierTests.length; i++){
            let easierTest = screen.easierTests[i];
            if(easierTest.type === "Easier Test" && easierTest.status === "Accepted"){
                obj.isAccepted = true;
            }
        }
        result.push(format("{assignee};{key};{movedDate};{time};{days};{isAccepted}", obj));
    }
    return result.join('\n');
};

const getUnique = (defects) => {
    let result = [];
    defects.forEach(defect => {
        let alreadyAdded = false;
        result.forEach(res => {
            if(defect.key === res.key){
                alreadyAdded = true;
            }
        });
        if(!alreadyAdded){
            result.push(defect);
        }
    });
    return defects;
};

const getNotCancelled = (defects) => {
  let result = [];
  for(let i = 0; i < defects.length; i++){
      let defect = defects[i];
      if(defect.status !== "Cancelled"){
          result.push(defect);
      }
  }
  return result;
};
const getNotExcluded = (defects) => {
    let result = [];
    for(let i = 0; i < defects.length; i++){
        let defect = defects[i];
        let isExcluded = false;
        for(let j = 0; j < excludedDefects.length; j++){
            let excludedDefect = excludedDefects[j];
            if(defect.key === excludedDefect){
                isExcluded = true;
                break;
            }
        }
        if(!isExcluded){
            result.push(defect);
        }
    }
    return result;
};

const hasTestCasesWrittenByScreen = (expandedScreens) => {
    let result = [];
    result.push("Screen;Developer;Hours in development;Days in development;Has test cases;Sprint;");
    for(let i = 0; i < expandedScreens.length; i ++ ) {
        let screen = expandedScreens[i];
        let hasTestCases = false;
        let startDate = Date.parse(screen.inDevelopmentDateTime);
        let endDate = new Date();
        let hoursInDevelopment = Math.floor((endDate - startDate) / 60000 / 60);
        let daysInDevelopment = hoursInDevelopment / 24;
        for(let j = 0; j < screen.easierTestWritingTasks.length; j++){
            let easierTestWritingTask = screen.easierTestWritingTasks[j];
            if(easierTestWritingTask.status === "Closed"){
                hasTestCases = true;
            }
        }
        let obj = {
            key : makeLink(screen.key),
            hoursInDevelopment : hoursInDevelopment,
            daysInDevelopment : daysInDevelopment,
            hasTestCases : hasTestCases,
            assignee : screen.assignee,
            sprint : screen.sprint
        };
        result.push(format("{key};{assignee};{hoursInDevelopment};{daysInDevelopment};{hasTestCases};{sprint};", obj));
    }
    return result.join('\n');
};

const avgTestsNumberPerScreen = (testedScreens, period) => {
  let result = [];
  let testsNumbers = [];
  for(let i = 0; i < testedScreens.length; i++){
      let testedScreen = testedScreens[i];
      if(testedScreen.easierTests){
          testsNumbers.push(testedScreen.easierTests.length)
      }
  }
  let avg = 0;
  for(let i = 0; i < testsNumbers.length; i++){
      avg += testsNumbers[i];
  }
  avg = avg / testsNumbers.length;
  let obj = {
      period : period,
      avgTime: avg
  };
  result.push("Period;AVG tests per screen;");
  result.push(format("{period};{avgTime};", obj));
  return result.join('\n');
};


const run0 = async () => {
    await jiraLib.init(config);
    //let list = ["KAYAKORW-639", "KAYAKORW-638", "KAYAKORW-597", "KAYAKORW-743", "KAYAKORW-569", "KAYAKORW-7", "KAYAKORW-6", "KAYAKORW-303", "KAYAKORW-304", "KAYAKORW-305", "KAYAKORW-302", "KAYAKORW-301", "KAYAKORW-284", "KAYAKORW-286", "KAYAKORW-241", "KAYAKORW-328", "KAYAKORW-334", "KAYAKORW-326", "KAYAKORW-333", "KAYAKORW-335", "KAYAKORW-306", "KAYAKORW-307", "KAYAKORW-308", "KAYAKORW-325", "KAYAKORW-332", "KAYAKORW-240", "KAYAKORW-236", "KAYAKORW-238", "KAYAKORW-239", "KAYAKORW-237", "KAYAKORW-1620", "KAYAKORW-1619", "KAYAKORW-698", "KAYAKORW-136", "KAYAKORW-135", "KAYAKORW-189", "KAYAKORW-76", "KAYAKORW-79", "KAYAKORW-55", "KAYAKORW-88", "KAYAKORW-36", "KAYAKORW-3330", "KAYAKORW-3331", "KAYAKORW-2991", "KAYAKORW-2994", "KAYAKORW-2876", "KAYAKORW-1018", "KAYAKORW-2799", "KAYAKORW-327", "KAYAKORW-2961", "KAYAKORW-317", "KAYAKORW-330", "KAYAKORW-331", "KAYAKORW-374", "KAYAKORW-367", "KAYAKORW-359", "KAYAKORW-360", "KAYAKORW-372", "KAYAKORW-369", "KAYAKORW-365", "KAYAKORW-368", "KAYAKORW-370", "KAYAKORW-341", "KAYAKORW-340", "KAYAKORW-357", "KAYAKORW-358", "KAYAKORW-364", "KAYAKORW-371", "KAYAKORW-373", "KAYAKORW-366", "KAYAKORW-356", "KAYAKORW-246", "KAYAKORW-251", "KAYAKORW-247", "KAYAKORW-252", "KAYAKORW-250", "KAYAKORW-245", "KAYAKORW-258", "KAYAKORW-254", "KAYAKORW-253", "KAYAKORW-255", "KAYAKORW-178", "KAYAKORW-45", "KAYAKORW-43", "KAYAKORW-38", "KAYAKORW-44", "KAYAKORW-70", "KAYAKORW-2990", "KAYAKORW-338", "KAYAKORW-339", "KAYAKORW-41", "KAYAKORW-336", "KAYAKORW-4479", "KAYAKORW-296", "KAYAKORW-3779", "KAYAKORW-3427", "KAYAKORW-3607", "KAYAKORW-3367", "KAYAKORW-2999", "KAYAKORW-2998", "KAYAKORW-2997", "KAYAKORW-3000", "KAYAKORW-3002", "KAYAKORW-3004", "KAYAKORW-179", "KAYAKORW-351", "KAYAKORW-3001", "KAYAKORW-3003", "KAYAKORW-2995", "KAYAKORW-2996", "KAYAKORW-323", "KAYAKORW-324", "KAYAKORW-3596", "KAYAKORW-2987", "KAYAKORW-2982", "KAYAKORW-4140", "KAYAKORW-298", "KAYAKORW-259", "KAYAKORW-263", "KAYAKORW-261", "KAYAKORW-264", "KAYAKORW-265", "KAYAKORW-260", "KAYAKORW-262", "KAYAKORW-347", "KAYAKORW-350", "KAYAKORW-346", "KAYAKORW-256", "KAYAKORW-137", "KAYAKORW-2174", "KAYAKORW-348", "KAYAKORW-257", "KAYAKORW-295", "KAYAKORW-3429", "KAYAKORW-1376", "KAYAKORW-2693", "KAYAKORW-1019", "KAYAKORW-1020", "KAYAKORW-1021", "KAYAKORW-1022", "KAYAKORW-3790", "KAYAKORW-6821", "KAYAKORW-3603", "KAYAKORW-6834", "KAYAKORW-3786", "KAYAKORW-751", "KAYAKORW-272", "KAYAKORW-361", "KAYAKORW-362", "KAYAKORW-363", "KAYAKORW-354", "KAYAKORW-269", "KAYAKORW-1410", "KAYAKORW-1585", "KAYAKORW-1584", "KAYAKORW-40", "KAYAKORW-1159", "KAYAKORW-895", "KAYAKORW-287", "KAYAKORW-290", "KAYAKORW-291", "KAYAKORW-289", "KAYAKORW-3784", "KAYAKORW-6165", "KAYAKORW-2975", "KAYAKORW-2981", "KAYAKORW-2976", "KAYAKORW-3600", "KAYAKORW-3606", "KAYAKORW-3781", "KAYAKORW-3092", "KAYAKORW-3091", "KAYAKORW-6819", "KAYAKORW-3602", "KAYAKORW-2992", "KAYAKORW-2175"];
    let list = [ "KAYAKORW-639"]


};

const run = async () => {
    await jiraLib.init(config);
    await mkdir(config.outputDir);
    let period = config.dates.start + " - " + config.dates.end;
    let easierTests = await jiraLib.loadEasierTests(config);
    // console.log(JSON.stringify(easierTests));
    // let defectsPerPlatformCSV = defectsPerPlatform(easierTests, period);
    // let testedScreens = await jiraLib.loadEasierStoriesMovedFromQAtoValidation(config);
    // let avgTestsNumberPerScreenCSV = avgTestsNumberPerScreen(testedScreens, period);
    // let defectsRankPerProjectCSV = defectsRankPerProject(testedScreens, period);
    // let defectsRankPerDeveloperCSV = defectsRankPerDeveloper(testedScreens, period);
    let rawDataCSV = rawData(easierTests, period);
    // let defectsPerProjectCSV = defectsPerProject(easierTests, period);
    // let defectsPerDeveloperCSV = defectsPerDeveloper(easierTests, period);
    // let passRatePerProjectCSV = passRatePerProject(easierTests, period);
    // let passRatePerDeveloperCSV = passRatePerDeveloper(easierTests, period);
    // let defectsFoundPerQACSV = defectsFoundPerQA(easierTests, config.dates);
    // let cancelledDefectsPerQACSV = cancelledDefectsPerQA(easierTests, config.dates);

    // Warning: slow also
    // let screensInQA = await jiraLib.loadEasierStoriesInStatus(config, "In Easier QA");
    // let ids = [];
    // for(let i = 0; i < screensInQA.length; i++){
    //     ids.push(screensInQA[i].id);
    // }
    // let expandedScreens =  await jiraLib.loadIssues(ids);
    // let livingInQATimeByScreenCSV = livingInQATimeByScreen(expandedScreens);
    // await save(config.outputDir + "living-in-qa-time-by-screen.csv", livingInQATimeByScreenCSV);

    // Warning: slow also
    // let screensInDevelopment = await jiraLib.loadEasierStoriesInStatus(config, "In Development");
    // ids = [];
    // for(let i = 0; i < screensInDevelopment.length; i++){
    //     ids.push(screensInDevelopment[i].id);
    // }
    // expandedScreens =  await jiraLib.loadIssues(ids);
    // let hasTestCasesWrittenByScreenCSV = hasTestCasesWrittenByScreen(expandedScreens);
    // await save(config.outputDir + "has-test-cases-by-screen.csv", hasTestCasesWrittenByScreenCSV);

    await save(config.outputDir + "raw-data.csv", rawDataCSV);
    // await save(config.outputDir + "project-quality-rank.csv", defectsRankPerProjectCSV);
    // await save(config.outputDir + "developers-quality-rank.csv", defectsRankPerDeveloperCSV);
    // await save(config.outputDir + "defects-per-project.csv", defectsPerProjectCSV);
    // await save(config.outputDir + "defects-per-developer.csv", defectsPerDeveloperCSV);
    // await save(config.outputDir + "pass-rate-per-project.csv", passRatePerProjectCSV);
    // await save(config.outputDir + "pass-rate-per-developer.csv", passRatePerDeveloperCSV);
    // await save(config.outputDir + "defects-found-per-qa.csv", defectsFoundPerQACSV);
    // await save(config.outputDir + "cancelled-defects-per-qa.csv", cancelledDefectsPerQACSV);
    // await save(config.outputDir + "avg-tests-number-per-screen.csv", avgTestsNumberPerScreenCSV);
    // await save(config.outputDir + "defects-per-platform.csv", defectsPerPlatformCSV);

    let generalCSV = rawDataCSV + "\n"
        // + defectsRankPerProjectCSV + "\n"
        // + defectsRankPerDeveloperCSV + "\n"
        // + defectsPerPlatformCSV + "\n"
        // + defectsPerProjectCSV + "\n"
        // + defectsPerDeveloperCSV + "\n"
        // + passRatePerProjectCSV + "\n"
        // + passRatePerDeveloperCSV + "\n"
        // + defectsFoundPerQACSV + "\n"
        // + cancelledDefectsPerQACSV + "\n"
        // + avgTestsNumberPerScreenCSV + "\n"
        // + livingInQATimeByScreenCSV + "\n"
        // + hasTestCasesWrittenByScreenCSV;
    await save(config.outputDir + "general-report.csv", generalCSV);
};

const countDefectsPerScreen = async () => {
    await jiraLib.init(config);
    let params = {
      start : "2018-07-01 00:00",
      end : "2018-09-09 23:59"
    };
    let jql = format("issuetype='Easier Story' and labels='Eng.Easier.UniqueScreen' and resolutiondate > '2015-01-01'", params);
    let issues = await jiraLib.search(jql);
    issues.forEach(issue => {
        let openEasierDefects = [];
        let openDefects = [];
        issue.easierDefects.forEach(defect => {
            let status = defect.status.toLowerCase();
            if(status === "cancelled" || status === "closed" || status === "not reproducible"){
            } else {
                openEasierDefects.push(defect);
            }
        });
        issue.defects.forEach(defect => {
            let status = defect.status.toLowerCase();
            if(status === "release pending" || status === "released" || status === "closed"){
            } else {
                openDefects.push(defect);
            }
        });
        let obj = {
            key : makeLink(issue.key),
            defectsNumber: openDefects.length,
            easierDefectsNumber: openEasierDefects.length,
            project: issue.project
        };
        if(openDefects.length == 0 && openEasierDefects.length == 0){

        } else {
            console.log(format("{key};{project};{defectsNumber};{easierDefectsNumber}",obj));
        }
    });
};

const countQAmetrics = async () => {
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
    await jiraLib.init(config);
    let params = {
        start : "2018-07-01 00:00",
        end : "2018-09-09 23:59"
    };
    let jql = format("issuetype='Easier Story' and labels='Eng.Easier.UniqueScreen' and status != Cancelled and resolutiondate > '2018-11-01'", params);
    let issues = await jiraLib.search(jql);
    issues.forEach(issue => {
        let easierDefects = [];
        let internalDefects = [];
        let externalDefects = [];
        let notCancelledEasierTest = [];
        issue.easierTests.forEach(easierTest => {
            if(easierTest.status.toLowerCase() == "cancelled"){
            } else {
                notCancelledEasierTest.push(easierTest);
            }
        });
        easierDefects = issue.easierDefects;
        issue.defects.forEach(defect => {
            console.log(defect.reporter);
        });
        let obj = {
            assignee : issue.assignee,
            key : makeLink(issue.key),
            project: issue.project,
            easierTestsNumber : issue.easierTests.length,
            defectsNumber : issue.defects.length,
            easierDefectsNumber : issue.easierDefects.length
        };
        //console.log(format("{key};{project};{assignee};{easierTestsNumber};{defectsNumber};{easierDefectsNumber}", obj));
    });
};


const getE2Es = async () => {
    await jiraLib.init(config);
    let params = {};
    let jql = format("issuetype = 'Functional Area' and project = M1.AlertFind", params);
    let issues = await jiraLib.search(jql);
    issues.forEach(issue => {
        issue.e2eTests.forEach(e2eTest => {
            let status = e2eTest.status.toLowerCase();
            if(status === "failed qb" || status === "cancelled"){

            } else {
                let obj = {
                    faKey : makeLink(issue.key),
                    faSummary: issue.summary,
                    project: issue.project,
                    e2eKey : makeLink(e2eTest.key),
                    e2eSummary : e2eTest.summary
                };
                console.log(format("{faKey};{faSummary};{project};{e2eKey};{e2eSummary}", obj));
            }
        });
    });
};

countQAmetrics();



