let env = {
    // dbUrl: 'mongodb://localhost:27017/reporter' || process.env.dbUrl,
    dbUrl: process.env.dbUrl,
    SERVER_SECRET: process.env.SERVER_SECRET || '1234',
    POSTSECRET: process.env.POSTSECRET,
}


module.exports = env;