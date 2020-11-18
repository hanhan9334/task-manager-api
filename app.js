const express = require('express');
const app = express();
const mogoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

//Load in mongoose models
const { List, Task, User } = require('./db/models/index');

//Link to mongeDB
require('./db/mongoose');


/* middleware */

//Load middleware
app.use(bodyParser.json());

//cors handler
app.use(function (req, res, next) {
    //Enabling CORS
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-client-key, x-client-token, x-client-secret, Authorization, x-access-token, x-refresh-token, _id");
    res.header(
        'Access-Control-Expose-Headers',
        'x-access-token, x-refresh-token'
    );
    next();
});


//check if request has a valid token
let authenticate = (req, res, next) => {
    const token = req.header('x-access-token');

    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if (err) {
            //jwt is invalid
            res.status(401).send(err);
        } else {
            req.user_id = decoded._id;
            next();
        }
    })
}



//verify refresh token
const verifySession = ((req, res, next) => {
    const refreshToken = req.header('x-refresh-token');
    const _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if (!user) {
            return Promise.reject({
                'error': 'User not found'
            })
        }

        req.user_id = user._id;
        req.refreshToken = refreshToken;
        req.userObject = user;

        let isSessionValid = false;

        user.sessions.forEach((session) => {
            if (session.token === refreshToken) {
                //check if the session expires
                if (user.hasRefreshTokenExpired(session.expiresAt) === false) {
                    isSessionValid = true;
                }
            }
        });


        if (isSessionValid) {
            next();
        } else {
            //sesson not valid
            return Promise.reject({
                'error': 'Refresh token has expired or the session is invalid.'
            })
        }
    }).catch((e) => {
        console.log(e);
        res.status(401).send(e);
    })

})


/**
 * GET/lists
 * Purpose: Get all lists
 */
app.get('/lists', authenticate, async (req, res) => {
    //Return an array of all the lists in the db
    try {
        const lists = await List.find({
            _userId: req.user_id
        });

        res.send(lists);
    } catch (e) {
        console.log(e);
        res.status(500).send(e);
    }


})

/**
 * POST/lists
 * Purpose:Create a list
 */
app.post('/lists', authenticate, async (req, res) => {
    //Create a new list and return the new list back to the user
    try {
        const title = await req.body.title;
        const newList = await new List({
            title,
            _userId: req.user_id
        });
        await newList.save();
        res.status(200)
            .header('Content-Type', 'application/json')
            .send(newList);
    } catch (e) {
        res.status(500).send(e);

    }


})


/**
 * PATCH/lists/:id
 * Purpose: Update a specific list
 */
app.patch('/lists/:id', authenticate, async (req, res) => {
    try {
        const list = await List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id }, {
            $set: req.body
        });
        console.log('called in api');
        res.send({ 'message': 'Updated' });
    } catch (e) {
        res.status(500).send(e);
        console.log(e);
    }


    //Update a specific list
})

/**
 * DELETE/lists/:id
 * Purpose: Delete a list
 */
app.delete('/lists/:id', authenticate, async (req, res) => {
    try {
        //Delete a list
        const list = await List.findByIdAndRemove({
            _id: req.params.id,
            _userId: req.user_id
        });
        deleteTasksFromList(list._id);
        res.status(200).send(list);
    } catch (e) {
        res.status(500).send(e);
    }
})

/**
 * get all tasks in a list
 **/
app.get('/lists/:listId/tasks', authenticate, async (req, res) => {
    try {
        const list = await Task.find({
            _listId: req.params.listId
        });
        res.send(list);
    } catch (e) {
        res.status(500);
    }

})

app.get('/lists/:listId/tasks/:taskId', async (req, res) => {
    const task = await Task.findOne({
        _id: req.params.taskId,
        _listId: req.params.listId
    });
    if (!task) {
        res.status(404).send("No this task.");
    } else {
        await task.save();
        res.status(200).send(task);
    }

})

/**
 * create new task in a specifc list
 **/
app.post('/lists/:listId/tasks', authenticate, async (req, res) => {
    try {
        const list = await List.findOne({
            _id: req.params.listId,
            _userId: req.user_id
        });
        if (!list) {
            res.staus(404);
        }
        const newTask = await new Task({
            title: req.body.title,
            _listId: req.params.listId
        });
        await newTask.save();
        res.send(newTask);
    } catch (e) {
        res.status(500);
    }

})


/**
 * update task in a specifc list
 **/

app.patch('/lists/:listId/tasks/:taskId', authenticate, async (req, res) => {
    try {
        const list = await List.findOne({
            _id: req.params.listId,
            _userId: req.user_id
        })
        if (!list) {
            res.status(404);
        }
        const task = await Task.findOneAndUpdate({ _id: req.params.taskId, _listId: req.params.listId }, {
            $set: req.body
        });
        if (!task) {
            res.status(404).send("Patch__No this task.");
        } else {
            await task.save();
            res.status(200).send(task);
        }

    } catch (e) {
        res.status(500).send(e);
        console.log(e);
    }

})

/**
 * Purpose: Delete a list
 */
app.delete('/lists/:listId/tasks/:taskId', authenticate, async (req, res) => {
    try {
        const list = await List.findOne({
            _id: req.params.listId,
            _userId: req.user_id
        })
        if (!list) {
            res.status(404);
        }
        //Delete a task
        const task = await Task.findByIdAndRemove({
            _id: req.params.taskId,
            _listId: req.params.listId
        });
        if (!task) {
            res.status(404).send("No this task.");
        } else {
            res.status(200).send(task);
        }
    } catch (e) {
        res.status(500).send(e);
    }
})


/**user routes */

/**
 * Purpose: Sign up
 */

app.post('/users', async (req, res) => {
    const newUser = User(req.body);
    try {
        const refreshToken = await newUser.createSession();
        const accessToken = await newUser.generateAccessAuthToken();
        console.log(refreshToken);
        // return { accessToken, refreshToken };
        res
            .header('x-refresh-token', refreshToken)
            .header('x-access-token', accessToken)
            .send(newUser);

    } catch (e) {
        res.status(500).send(e);
        console.log(e);
    }

})

/**
 * Purpose: Login
 */

app.post('/users/login', async (req, res) => {
    try {
        const user = await User.findByCredentials(req.body.email, req.body.password);
        console.log(user);
        const refreshToken = await user.createSession();
        const accessToken = await user.generateAccessAuthToken();
        res
            .header('x-refresh-token', refreshToken)
            .header('x-access-token', accessToken)
            .send(user);

    } catch (e) {
        console.log(e);
        res.status(500).send(e);
    }

})

/**
 * get access token
 */

app.get('/users/me/access-token', verifySession, async (req, res) => {
    try {
        const accessToken = await req.userObject.generateAccessAuthToken();
        res.header('x-access-token', accessToken).send({ accessToken });
    } catch (e) {
        console.log(e);
        res.status(500).send(e);
    }

})

/*Helpers*/
const deleteTasksFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log(`Tasks from ${_listId} were deleted.`);
    });

}

app.listen(3000, () => {
    console.log("Server running on port 3000");
})