const bcrypt = require("bcrypt");
const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server is Started at http://localhost:3000/")
    );
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertStateDbObjectIntoResponseObject = (dbObjectState) => {
  return {
    stateId: dbObjectState.state_id,
    stateName: dbObjectState.state_name,
    population: dbObjectState.population,
  };
};
const convertDistrictDbObjectIntoResponseObject = (dbObjectDistrict) => {
  return {
    districtId: dbObjectDistrict.district_id,
    districtName: dbObjectDistrict.district_name,
    stateId: dbObjectDistrict.state_id,
    cases: dbObjectDistrict.cases,
    cured: dbObjectDistrict.cured,
    active: dbObjectDistrict.active,
    deaths: dbObjectDistrict.deaths,
  };
};

/**Creating AuthenticationToken(middleware function)*/
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

/**Login API*/
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const searchUserQuery = `select * from user where username= "${username}";`;
  const result = await db.get(searchUserQuery);

  if (result === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPassMatch = await bcrypt.compare(password, result.password);
    if (isPassMatch === true) {
      const payload = { username: username };

      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

/**GET states API (using authentication)*/
app.get("/states/", authenticateToken, async (request, response) => {
  const getStatedQuery = `
    select *
    from state;`;
  const statesArray = await db.all(getStatedQuery);
  response.send(
    statesArray.map((eachState) =>
      convertStateDbObjectIntoResponseObject(eachState)
    )
  );
});

/**GET states API (using authentication)*/
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;

  const getStateQuery = `
        select *
        from state
        where 
            state_id = ${stateId};`;
  const state = await db.get(getStateQuery);
  response.send(convertStateDbObjectIntoResponseObject(state));
});

/**GET districts API (using authentication)*/
app.post("/districts/", authenticateToken, async (request, response) => {
  const { stateId, districtName, cases, cured, active, deaths } = request.body;
  const addDistrictQuery = `
    insert into 
    district (state_id,district_name,cases,cured,active,deaths)
    values (
         ${stateId},
         "${districtName}",
         ${cases},
         ${cured},
         ${active},
         ${deaths});`;
  await db.run(addDistrictQuery);

  response.send("District Successfully Added");
});

/**GET district API (using authentication)*/
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const getDistrictQuery = `
        select *
        from district
        where 
            district_id = ${districtId};`;
    const district = await db.get(getDistrictQuery);
    response.send(convertDistrictDbObjectIntoResponseObject(district));
  }
);

/**DELETE district API (using authentication)*/
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = ${districtId} 
  `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
  UPDATE
    district
  SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active}, 
    deaths = ${deaths}
  WHERE
    district_id = ${districtId};
  `;

    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

/**API-7 */
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
    select
        sum(cases),
        sum(cured),
        sum(active),
        sum(deaths)
    from 
        district
    where
        state_id= ${stateId};`;
    const stats = await db.get(getStateStatsQuery);
    response.send({
      totalCases: stats["sum(cases)"],
      totalCured: stats["sum(cured)"],
      totalActive: stats["sum(active)"],
      totalDeaths: stats["sum(deaths)"],
    });
  }
);

module.exports = app;
