const express = require('express');
let {param, check} = require('express-validator');
const scrapeController = require('../controllers/scrapeController');
const projectSummaryController = require('../controllers/projectSummaryController');
const criticalPathController = require('../controllers/criticalPathController');

const checks_Errors_warnings = require('../middlewares/checks');

const router = express.Router();

//**validation required */
router.post('/register-snapshot', [
        check('snapshot_date').not().isEmpty(),
        check('snapshot_url').not().isEmpty()
    ],
    (req, res, next)=>{
            checks_Errors_warnings.checks(req,res,next);
    }
,scrapeController.scrape);
router.get('/snapshot-dates/:id',projectSummaryController.snapshotDates);
router.get('/project-summary', projectSummaryController.projectSummary);
router.get('/task-details', projectSummaryController.taskDetails);
router.get('/contributor-data', projectSummaryController.contributorDetail);
router.get('/performance', projectSummaryController.performanceMetrics);
router.post('/add-note', projectSummaryController.addNote);
router.get('/get-notes/:id', projectSummaryController.getNote);
router.get('/latest-project-summary', projectSummaryController.loadLatestProjectSummary);
router.delete('/snapshot', projectSummaryController.deleteSnapshot);
router.get('/criticalPath', criticalPathController.criticalPath);

//**NO validation required */
router.get('/all-projects', projectSummaryController.allProjects);
router.get('/task-contributors', projectSummaryController.taskContributors);

module.exports = router;