const mongoose = require('mongoose');
const loadash = require('lodash');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { nextTick } = require('process');
const { resolve } = require('path');
const { reject } = require('lodash');

//JWT secret
const jwtSecret = 'comp229';

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
    },
    password: {
        type: String,
        required: true

    },
    name: {
        type: String
    },
    number: {
        type: String
    },
    sessions: [{
        token: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Number,
            required: true
        }
    }]
});

//**instance method */
// UserSchema.methods.toJSON = function () {
//     const user = this;
//     const userObject = user.toObject();

//     //return the document except the password and sessions
//     return (_.omit(userObject, ['password', 'sessions']));
// }

UserSchema.methods.generateAccessAuthToken = function () {
    const user = this;
    return new Promise((resolve, reject) => {
        //Create jwt and return it
        jwt.sign({ _id: user._id.toHexString() }, jwtSecret, { expiresIn: '15s' }, (err, token) => {
            if (!err) {
                resolve(token);
            } else {
                reject();
            }
        });
    })
}

UserSchema.methods.generateRefreshAuthToken = function () {
    //generate a 64 byte hex string, it is not saved in the db
    return new Promise((resolve, reject) => {
        crypto.randomBytes(64, (err, buf) => {
            if (!err) {
                let token = buf.toString('hex');

                return resolve(token);
            }
        })
    })
}

UserSchema.methods.createSession = function () {
    let user = this;

    return user.generateRefreshAuthToken().then((refreshToken) => {
        return saveSessionToDb(user, refreshToken);
    }).then((refreshToken) => {
        return refreshToken;
    }).catch((e) => {
        return Promise.reject('Fail to save session to db.\n' + e);
    })
}

/**static methods */

UserSchema.statics.getJWTSecret = () => {
    return jwtSecret;
}

UserSchema.statics.findByIdAndToken = function (_id, token) {
    const User = this;
    return User.findOne({
        _id,
        "sessions.token": token
    });
}

UserSchema.statics.findByCredentials = function (email, password) {
    const User = this;
    return User.findOne({ email }).then((user) => {
        if (!user) {
            return Promise.reject;
        }
        return new Promise((resolve, reject) => {
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) {
                    resolve(user);
                } else {
                    reject();
                }
            })
        })
    })
}

UserSchema.methods.hasRefreshTokenExpired = ((expiresAt) => {
    const secondSinceEpoch = Date.now() / 1000;
    if (expiresAt > secondSinceEpoch) {
        return false;
    } else {
        return true;
    }
})


/**middlewares */
UserSchema.pre('save', function (next) {
    const user = this;
    if (user.isModified('password')) {
        bcrypt.genSalt(8, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            })
        })
    } else {
        next();
    }
})

/*helper methods*/
let saveSessionToDb = async (user, refreshToken) => {
    return new Promise((resolve, reject) => {
        let expiresAt = generateRefreshTokenExpiryTime();

        user.sessions.push({ 'token': refreshToken, expiresAt });

        user.save().then(() => {
            return resolve(refreshToken);
        }).catch((e) => {
            reject(e);
        })
    })
}

let generateRefreshTokenExpiryTime = () => {
    let daysUntilExpire = '10';
    let secondsUnitExpire = ((daysUntilExpire * 24) * 60) * 60;
    return ((Date.now() / 1000) + secondsUnitExpire);
}

const User = mongoose.model('user', UserSchema);

module.exports = User;