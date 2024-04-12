let express = require('express') //importing form express third-party-package
let app = express() //express instance
let {open} = require('sqlite')
let path = require('path')
let dbpath = path.join(__dirname, 'twitterClone.db')
let sqlite3 = require('sqlite3')
let bcrypt = require('bcrypt')
let jwt = require('jsonwebtoken')
app.use(express.json())

let db = null
let initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server is running')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBandServer()

//MIDDLEWARE
function tokenAuthenticate(request, response, next) {
  let jwtToken
  let tokenB = request.headers['authorization']
  if (tokenB !== undefined) {
    jwtToken = tokenB.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'secret', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        let {username} = payload
        let dbquery = `select * from user where username = '${username}';`
        let dbUser = await db.get(dbquery)
        request.userDetails = dbUser
        next()
      }
    })
  }
}

let verfier = async (request, response, next) => {
  let {tweetId} = request.params
  let {user_id} = request.userDetails
  let dbquery_1 = `
    select *
    from follower inner join tweet on 
    follower.following_user_id = tweet.user_id 
    where follower.follower_user_id = ${user_id} and
    tweet.tweet_id = ${tweetId};`
  let dbresponse = await db.get(dbquery_1)

  if (dbresponse === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API-1 (REGISTER)
app.post('/register/', async (request, response) => {
  let {username, password, name, gender} = request.body
  let hashedPassword = await bcrypt.hash(password, 10)
  let dbquery = `select * from user where username = '${username}';`
  let dbUser = await db.get(dbquery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      let dbquery_1 = `
            insert into user(username,password,gender,name)
            values ('${username}','${hashedPassword}','${gender}','${name}');`
      await db.run(dbquery_1)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API-2 (LOGIN)
app.post('/login/', async (request, response) => {
  let {username, password} = request.body
  let dbquery = `select * from user where username = '${username}';`
  let dbUser = await db.get(dbquery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    let passwordCompare = await bcrypt.compare(password, dbUser.password)
    if (passwordCompare) {
      response.status(200)
      let jwtToken = jwt.sign({username: username}, 'secret')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API-3
app.get('/user/tweets/feed', tokenAuthenticate, async (request, response) => {
  let {user_id} = request.userDetails
  let dbquery_1 = `
  select 
  user.username as username,
  tweet.tweet as tweet,
  tweet.date_time as dateTime
  from (follower inner join tweet on 
  follower.following_user_id = tweet.user_id) inner join user on 
  follower.following_user_id = user.user_id
  where follower.follower_user_id = ${user_id}
  order by tweet.date_time DESC
  limit 4 offset 0`
  let dbresponse = await db.all(dbquery_1)
  response.send(dbresponse)
})

//API-4
app.get('/user/following/', tokenAuthenticate, async (request, response) => {
  let {user_id} = request.userDetails
  let dbquery_1 = `
  select user.name 
  from follower inner join user on 
  follower.following_user_id = user.user_id
  where follower.follower_user_id = ${user_id};`
  let dbresponse = await db.all(dbquery_1)
  response.send(dbresponse)
})

//API-5
app.get('/user/followers/', tokenAuthenticate, async (request, response) => {
  let {user_id} = request.userDetails
  let dbquery_1 = `
  select user.name 
  from follower inner join user on 
  follower.follower_user_id = user.user_id
  where follower.following_user_id = ${user_id};`
  let dbresponse = await db.all(dbquery_1)
  response.send(dbresponse)
})

//API-6
app.get(
  '/tweets/:tweetId/',
  tokenAuthenticate,
  verfier,
  async (request, response) => {
    let {tweetId} = request.params
    let {user_id} = request.userDetails
    let dbquery_tw = `
    select tweet,date_time 
    from tweet
    where tweet_id = ${tweetId};`
    let obj_1 = await db.get(dbquery_tw)

    let dbquery_rp = `
    select count(reply_id) as replies
    from reply
    where tweet_id = ${tweetId};`
    let obj_2 = await db.all(dbquery_rp)

    let dbquery_li = `
    select count(like_id) as likes
    from like 
    where tweet_id = ${tweetId};`
    let obj_3 = await db.all(dbquery_li)

    let result = {
      tweet: obj_1.tweet,
      likes: obj_3[0].likes,
      replies: obj_2[0].replies,
      dateTime: obj_1.date_time,
    }
    response.send(result)
  },
)

//API-7
app.get(
  '/tweets/:tweetId/likes/',
  tokenAuthenticate,
  verfier,
  async (request, response) => {
    let {tweetId} = request.params
    let {user_id} = request.userDetails
    let dbquery_li = `
    select user.username as username
    from like natural join user
    where like.tweet_id = ${tweetId};`
    let array_1 = await db.all(dbquery_li)
    let result = {
      likes: [],
    }
    for (let i of array_1) {
      result.likes.push(i.username)
    }
    response.send(result)
  },
)

//API-8
app.get(
  '/tweets/:tweetId/replies/',
  tokenAuthenticate,
  verfier,
  async (request, response) => {
    let {tweetId} = request.params
    let {user_id} = request.userDetails
    let dbquery_rp = `
    select 
    user.name as name,
    reply.reply as reply
    from reply natural join user
    where reply.tweet_id = ${tweetId};`
    let array_1 = await db.all(dbquery_rp)
    response.send({replies: array_1})
  },
)

//API-9
app.get('/user/tweets/', tokenAuthenticate, async (request, response) => {
  let {user_id} = request.userDetails
  let dbquery_1 = `
  select tweet,date_time,tweet_id
  from tweet
  where user_id = ${user_id};`
  let array_1 = await db.all(dbquery_1)
  let array_new = []
  for (let i of array_1) {
    let dbquery_rp = `
    select count(reply_id) as replies
    from reply
    where tweet_id = ${i.tweet_id};`
    let obj_2 = await db.all(dbquery_rp)

    let dbquery_li = `
    select count(like_id) as likes
    from like 
    where tweet_id = ${i.tweet_id};`
    let obj_3 = await db.all(dbquery_li)

    let result = {
      tweet: i.tweet,
      likes: obj_3[0].likes,
      replies: obj_2[0].replies,
      dateTime: i.date_time,
    }
    array_new.push(result)
  }
  response.send(array_new)
})

//API-10
app.post('/user/tweets/', tokenAuthenticate, async (request, response) => {
  let {user_id} = request.userDetails
  let {tweet, userId = user_id} = request.body
  let dbquery_1 = `
  insert into tweet(tweet,user_id)
  values ('${tweet}',${userId});`
  await db.run(dbquery_1)
  response.send('Created a Tweet')
})

//API-11
app.delete(
  '/tweets/:tweetId/',
  tokenAuthenticate,
  async (request, response) => {
    let {tweetId} = request.params
    let {user_id} = request.userDetails
    let dbquery_1 = `
    select *
    from tweet 
    where user_id = ${user_id} and tweet_id = ${tweetId};`
    let userTweet = await db.get(dbquery_1)

    if (userTweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      let deleteQuery = `
      delete from tweet
      where tweet_id = ${tweetId};`
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app //default exporting express instance
