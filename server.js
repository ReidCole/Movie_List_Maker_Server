require("dotenv").config();
const axios = require("axios");
const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");
const dayjs = require("dayjs");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const User = require("./schemas/User");
const List = require("./schemas/List");
const RefreshToken = require("./schemas/RefreshToken");
const app = express();
const port = 4000;
app.use(
  cors({
    origin: "https://snazzy-snickerdoodle-781b19.netlify.app",
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(cookieParser());

mongoose.connect("mongodb://localhost/movielistmaker");

app.listen(port, () => {
  console.log("express server listening");
});

app.get("/getlist/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const list = await List.findById(objectId);
    if (list == null) {
      res.sendStatus(404);
    } else {
      res.status(200).send(list);
    }
  } catch (e) {
    console.error(e.message);
    res.status(500).send();
  }
});

app.get("/searchmovies/:query", async (req, res) => {
  const query = req.params.query;
  try {
    const tmdbRes = await axios.get(
      `https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&language=en-US&query=${query}&page=1&include_adult=false`
    );
    const data = tmdbRes.data;
    res.status(200).send(data);
  } catch (e) {
    console.error(e.message);
    res.status(500).send();
  }
});

app.post("/createlist", async (req, res) => {
  const reqBody = req.body;
  try {
    const list = await List.create({
      listName: reqBody.listName,
      listDescription: reqBody.listDescription,
      listings: reqBody.listings.map((reqListing) => ({
        title: reqListing.title,
        imgUrl: reqListing.imgUrl,
        movieDbId: reqListing.movieDbId,
        mediaType: reqListing.mediaType,
        idWithinList: reqListing.idWithinList,
      })),
      ownerUsername: reqBody.ownerUsername,
      creationDate: Date.now(),
      lastUpdatedDate: Date.now(),
    });
    const user = await User.findOne({ username: reqBody.ownerUsername });
    if (user === null) {
      console.log("tried to save to account that doesn't exist in database");
      return res.sendStatus(404);
    }
    if (typeof user.lists === "undefined") {
      user.lists = [list._id];
    }
    user.lists = [...user.lists, list._id];
    await user.save();
    console.log("new list created");
    res.status(200).send(list._id);
  } catch (e) {
    console.error(e.message);
    res.status(500).send();
  }
});

app.patch("/updatelist/:id", authenticateToken, async (req, res) => {
  const id = req.params.id;
  const reqBody = req.body;
  try {
    const list = await List.findById(id);
    list.listName = reqBody.listName;
    list.listDescription = reqBody.listDescription;
    list.listings = reqBody.listings;
    await list.save();
    console.log("updated list successfully");
    res.status(200).send(list);
  } catch (e) {
    console.error(e.message);
    res.status(500).send();
  }
});

app.delete("/deletelist/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const user = await User.findOne({ lists: id });
    if (!user) return res.sendStatus(404);

    const idToRemove = new mongoose.Types.ObjectId(id);
    user.lists = user.lists.filter((list) => !list.equals(idToRemove));
    await user.save();

    await List.deleteOne({ _id: id });

    res.sendStatus(200);
    console.log("list deleted successfully");
  } catch (e) {
    console.error(e.message);
    res.sendStatus(500);
  }
});

// Authentication

const bcrypt = require("bcrypt");

app.post("/login", async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (user === null) {
    console.log("cant find user with username", req.body.username);
    return res.status(404).send("Cannot find user");
  }
  try {
    if (await bcrypt.compare(req.body.password, user.password)) {
      const userObj = {
        username: user.username,
      };
      const accessToken = generateAccessToken(userObj);
      // check if this user is already signed in
      const existingToken = await RefreshToken.findOne({ username: user.username });
      let refreshToken = "";
      if (existingToken === null) {
        console.log("new refresh token");
        refreshToken = await generateRefreshToken(userObj);
      } else {
        console.log("using existing token");
        refreshToken = existingToken.token;
      }

      res.cookie("refresh-token", refreshToken, {
        httpOnly: true,
        expires: dayjs().add(30, "days").toDate(),
        sameSite: "none",
        secure: true,
      });
      res.status(200).json({
        accessToken: accessToken,
      });
    } else {
      res.status(405).send("Incorrect password");
    }
  } catch (e) {
    console.error(e.message);
    res.status(500).send();
  }
});

app.post("/signup", async (req, res) => {
  try {
    const alreadyExists = (await User.exists({ username: req.body.username })) !== null;
    if (alreadyExists) {
      console.log("already a user with username", req.body.username);
      return res.status(409).send("Username already exists");
    }

    if (req.body.username.length < 3 || req.body.username.length > 20) {
      console.log("username too short or long. length:", req.body.username.length);
      return res.status(405).send("Username invalid length");
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const now = Date.now();
    const user = new User({
      username: req.body.username,
      password: hashedPassword,
      creationDate: now,
      lastLoginDate: now,
    });
    const userObj = {
      username: user.username,
    };

    const accessToken = generateAccessToken(userObj);
    const refreshToken = await generateRefreshToken(userObj);

    res.cookie("refresh-token", refreshToken, {
      httpOnly: true,
      expires: dayjs().add(30, "days").toDate(),
      sameSite: "none",
      secure: true,
    });
    await user.save();
    res.status(201).send({ accessToken: accessToken });
  } catch (e) {
    console.error(e.message);
    res.status(500).send();
  }
});

app.post("/token", async (req, res) => {
  try {
    const refreshToken = req.cookies["refresh-token"];
    if (typeof refreshToken === "undefined") return res.sendStatus(401);
    const tokenInDb = await RefreshToken.findOne({ token: refreshToken });
    if (tokenInDb === null) {
      console.log("refresh token doesn't exist");
      return res.sendStatus(403);
    }
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, user) => {
      if (err) {
        console.log("invalid refresh token. deleting it on server.");
        await RefreshToken.deleteMany({ token: refreshToken });
        return res.sendStatus(403);
      }
      const userObj = {
        username: user.username,
      };
      const accessToken = generateAccessToken(userObj);
      console.log("sending token");
      res.json({
        accessToken: accessToken,
        username: user.username,
      });
    });
  } catch (e) {
    console.error(e);
  }
});

app.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies["refresh-token"];
    if (typeof refreshToken === "undefined") return res.sendStatus(401);
    const tokenInDb = await RefreshToken.findOne({ token: refreshToken });
    if (tokenInDb === null) {
      console.log("refresh token doesn't exist");
      return res.sendStatus(403);
    }
    await RefreshToken.deleteMany({ token: refreshToken });
    res.clearCookie("refresh-token");
    res.sendStatus(200);
  } catch (e) {
    console.error(e);
  }
});

app.post("/getaccountlists", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.body.username });
    if (user === null) {
      console.log("cant find user with username", req.body.username);
      return res.status(404).send("Cannot find user");
    }

    let listLinks = [];
    let nullLists = [];
    for (let i = 0; i < user.lists.length; i++) {
      const list = await List.findById(user.lists[i]);
      if (list !== null) {
        const listLink = {
          listName: list.listName,
          listId: list._id,
        };
        listLinks.push(listLink);
      } else {
        nullLists.push(user.lists[i]);
      }
    }

    if (nullLists.length > 0) {
      for (let i = 0; i < nullLists.length; i++) {
        user.lists = user.lists.filter((list) => !list.equals(nullLists[i]));
      }
      await user.save();
    }

    res.json(listLinks);
  } catch (e) {
    console.error(e.message);
    res.sendStatus(500);
  }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader ? authHeader.split(" ")[1] : null;
  if (token === null) {
    console.log("token is null");
    return res.sendStatus(401);
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      console.log(err.message);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

function generateAccessToken(userObj) {
  return jwt.sign(userObj, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "3m" });
}

async function generateRefreshToken(userObj) {
  const refreshToken = jwt.sign(userObj, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "30d" });
  // create new token in db
  await RefreshToken.create({
    token: refreshToken,
    username: userObj.username,
  });
  return refreshToken;
}
