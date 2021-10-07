let env = {
    dbUrl: process.env.dbUrl,
    SERVER_SECRET: '1234' || process.env.SERVER_SECRET,
    POSTSECRET: process.env.POSTSECRET,
}


module.exports = env;