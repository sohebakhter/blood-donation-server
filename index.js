const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const stripe = require("stripe")(process.env.SECRET_KEY);
///////////////////////////
var admin = require("firebase-admin");

var serviceAccount = require("./blood-donation-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
////////////////////////////////

//middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  // console.log(token);
  if (!token) {
    res.status(401).send({ message: "Unauthorized Access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

app.get("/", (req, res) => {
  res.send(" Blood Donation Server Running...");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@sohebcluster.mbyuxfx.mongodb.net/?appName=SohebCluster`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const db = client.db("bloodDonationDB");
    const usersCollection = db.collection("users");
    const donationRequestsCollection = db.collection("donationRequests");
    const paymentsCollection = db.collection("payments");
    //users related apis--------------------------------------------------------------------------
    app.get("/users", async (req, res) => {
      const role = req.query.role;
      const query = { role: role };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/users-profile", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }

      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "donor" }); //API থেকে জাস্ট role যাচ্ছে (based on email)
    });

    //admin এর জন্য
    app.get("/all-users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    //search এর জন্য get
    app.get("/search-donors", async (req, res) => {
      const { bloodGroup, district, upazila, role } = req.query;

      const query2 = { role: role };
      const isDonor = await usersCollection.findOne(query2);
      if (!isDonor) {
        return res.status(406).send({ message: "This Search not for Donor" });
      }

      const query = {};
      if (bloodGroup) query.bloodGroup = bloodGroup;
      if (district) query.district = district;
      if (upazila) query.upazila = upazila;

      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "donor";
      user.createdAt = new Date();

      const email = user.email;
      const exitsUser = await usersCollection.findOne({ email });
      if (exitsUser) {
        return res.send({ message: "user exits" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/user-profile/:id", verifyFBToken, async (req, res) => {
      const { displayName, bloodGroup } = req.body;

      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const updateDonor = {
        $set: {
          displayName: displayName,
          bloodGroup: bloodGroup,
          district: req.body.district,
          upazila: req.body.upazila,
        },
      };
      const result = await usersCollection.updateOne(query, updateDonor);
      res.send(result);
    });

    app.patch("/user-status/:id", verifyFBToken, async (req, res) => {
      const { status } = req.body;

      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedStatus = {
        $set: { status: status },
      };
      const result = await usersCollection.updateOne(query, updatedStatus);
      res.send(result);
    });
    //--
    app.patch("/user-role/:id", verifyFBToken, async (req, res) => {
      const { role } = req.body;

      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedRole = {
        $set: { role: role },
      };
      const result = await usersCollection.updateOne(query, updatedRole);
      res.send(result);
    });

    //donation requests related apis----------------------------------------------------------------------
    app.get("/total-donation", async (req, res) => {
      const result = await donationRequestsCollection.find().toArray();
      res.send(result);
    });

    app.get("/dashboard", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.requesterEmail = email;
      }
      const result = await donationRequestsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();
      res.send(result);
    });

    app.get("/my-donation-requests", async (req, res) => {
      const email = req.query.email;
      const { limit = 0, skip = 0 } = req.query;
      const query = {};
      if (email) {
        query.requesterEmail = email;
      }
      const totalCount = await donationRequestsCollection.countDocuments();

      const result = await donationRequestsCollection
        .find(query)
        .limit(Number(limit))
        .skip(Number(skip))
        .sort({ createdAt: -1 })
        .toArray();
      res.send({ data: result, total: totalCount });
    });

    //id based donation request for (editing)
    app.get("/donation-requests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationRequestsCollection.findOne(query);
      res.send(result);
    });

    //pending based all data
    app.get("/donation-requests", async (req, res) => {
      const status = req.query.status;
      const query = { donationStatus: status };
      const result = await donationRequestsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/donation-requests", async (req, res) => {
      const email = req.body.requesterEmail;
      const query = { email: email, status: "active" };
      const activeUser = await usersCollection.findOne(query);

      if (!activeUser) {
        return res
          .status(406)
          .send({ message: "blocked User can't Create Request" });
      }
      ///////////////
      const donationRequest = req.body;
      donationRequest.createdAt = new Date();
      const result = await donationRequestsCollection.insertOne(
        donationRequest
      );
      res.send(result);
    });

    app.patch("/donation-requests/:id", verifyFBToken, async (req, res) => {
      const { donationStatus } = req.body;

      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          donationStatus: donationStatus,
        },
      };
      const result = await donationRequestsCollection.updateOne(
        query,
        updateStatus
      );
      res.send(result);
    });
    //edit-donation-req total data(এর জন্য)
    app.patch(
      "/update-donation-request/:id",
      verifyFBToken,
      async (req, res) => {
        const {
          recipientName,
          recipientDistrict,
          recipientUpazila,
          hospitalName,
          fullAddress,
          donationStatus,
        } = req.body;

        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateWholeData = {
          $set: {
            recipientName,
            recipientDistrict,
            recipientUpazila,
            hospitalName,
            fullAddress,
            donationStatus,
          },
        };
        const result = await donationRequestsCollection.updateOne(
          query,
          updateWholeData
        );
        res.send(result);
      }
    );

    app.delete("/donation-requests/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationRequestsCollection.deleteOne(query);
      res.send(result);
    });

    //payments related apis----------------------------------------------------------------------------------------------------
    app.get("/payments", async (req, res) => {
      const result = await paymentsCollection.find().toArray();
      res.send(result);
    });

    app.get("/all-payments", async (req, res) => {
      const limit = Number(req.query.limit) || 10;
      const skip = Number(req.query.skip) || 0;

      const totalCount = await paymentsCollection.countDocuments();

      const result = await paymentsCollection
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      res.send({
        data: result,
        total: totalCount,
      });
    });

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.amount) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          createdAt: paymentInfo.createdAt,
          senderName: paymentInfo.senderName,
        },
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        success_url: `${process.env.SITE_DOMAIN}/funding/payment-success?session_id={CHECKOUT_SESSION_ID}`, //ekhane eta string hole o eta kintu dynamic, autometic dynamic by stripe
        cancel_url: `${process.env.SITE_DOMAIN}/funding/payment-cancelled`,
      });
      res.send({ url: session.url });
    });

    app.post(`/payment-success`, async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // console.log("sessoin info", session);
      const query = { transactionId: session.payment_intent };
      const paymentExits = await paymentsCollection.findOne(query);
      if (paymentExits) {
        return res.send({ message: "payment already exits" });
      }

      if (session.payment_status === "paid") {
        const dollar = session.amount_total / 100;
        const paymentInfo = {
          paymentStatus: session.payment_status,
          transactionId: session.payment_intent,
          senderName: session.metadata.senderName,
          senderEmail: session.customer_email,
          amount: dollar,
          createdAt: new Date(),
        };

        const result = await paymentsCollection.insertOne(paymentInfo);
        return res.send(result);
      }
      return res.send({ success: false });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Blood Donation is Running on ${port}`);
});
