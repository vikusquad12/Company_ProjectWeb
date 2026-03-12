import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import express from "express"
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";      
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cron from "node-cron";

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


// Multer middleware for KYC upload
// KYC Cloudinary storage
const kycCloudStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const userId = req.session?.user?._id || "guest";
        const folder = "kyc_docs";
        const format = file.mimetype === "application/pdf" ? "pdf" : "jpg";

        return {
            folder: folder,
            public_id: `${userId}_${Date.now()}`,
            resource_type: file.mimetype === "application/pdf" ? "raw" : "image",
            format: format
        };
    }
});

// Export multer instance for KYC uploads
export const uploadKycCloud = multer({
    storage: kycCloudStorage,
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only JPG, PNG, or PDF allowed!"), false);
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Cloudinary storage for profile pictures
const profileCloudStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "profile_pics",
        allowed_formats: ["jpg", "png", "jpeg"]
    }
});

// Multer instance for profile pics
export const uploadProfileCloud = multer({
    storage: profileCloudStorage,
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/jpg"];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only JPG, PNG allowed!"), false);
    },
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

import Register from "./models/registers.js";
import Message from "./models/message.js";
import Notification from "./models/notification.js";


mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB Atlas Connection Successful");
    })
    .catch((e) => {
        console.log("MongoDB Atlas Connection Failed");
        console.log(e);
    });


import path from "path"
import { fileURLToPath } from "url";



import session from "express-session";
import MongoStore from "connect-mongo";




const app = express();
const port = process.env.PORT || 8000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const absPathh = path.resolve("..", "views");
const static_path = path.join(__dirname, "../public");
app.use(express.static(static_path));
app.use(express.json());
app.use(express.urlencoded({extended : false}));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));



app.use(session({
    secret: process.env.SESSION_SECRET, // change this to a strong secret
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: "sessions"
    }),
    cookie: { maxAge: 1000 * 60 * 60 } // 1 hour
}));

// Middleware to check if user is logged in
function ensureLoggedIn(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/user-login'); 
    }
    req.user = req.session.user; // attach session user to req
    next();
}


app.get('/route', (req, res) => {
   console.log(req.session.user._id);
});

app.get("/", (req,resp)=>{
    // console.log(req.url)
    // resp.sendFile( absPathh + '/home.html')
    resp.render('home')
})

app.get("/user-login", (req,resp)=>{
    resp.render("login")
})



// user logged-in route
app.get("/user-loggedin", async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect("/");
    }

    const freshUser = await Register.findById(req.session.user._id);

    // Update session also
    req.session.user = {
        ...req.session.user,
        kycDocument: freshUser.kycDocument
    };

    res.render("user-loggedin", { user: freshUser });
});


// Upload Profile Picture
app.post("/upload-profile-pic", (req, res) => {

    uploadProfileCloud.single("profilePic")(req, res, async function (err) {

        if (err) {
            return res.status(400).send(err.message);
        }

        try {
            if (!req.session.user) return res.redirect("/");

            const imageUrl = req.file.path; // Cloudinary URL

            const updatedUser = await Register.findByIdAndUpdate(
                req.session.user._id,
                { profilePic: imageUrl },
                { returnDocument: "after" }
            );

            req.session.user.profilePic = updatedUser.profilePic;

            req.session.save(err => {
                if (err) console.log(err);
                res.redirect("/user-loggedin?updated=true");
            });

        } catch (error) {
            console.log(error);
            res.status(500).send("Upload failed");
        }

    });
});


app.post("/user-login-check", async (req, res) => {
    try {
        const check = await Register.findOne({ username: req.body.username.trim() });
        if (!check) return res.render("login", { error: "User not found" });

        if (!check.isActive) {
            // ✅ Redirect to login with error message
            return res.render("login", { error: "Your account is inactive. Please contact admin." });
        }

        const isMatch = await bcrypt.compare(req.body.password, check.password);
        if (!isMatch) return res.render("login", { error: "Wrong password" });

        // set session
       req.session.user = {
            _id: check._id,
            username: check.username,
            email: check.email,
            phone: check.phone,
            profilePic: check.profilePic,
            referralCode: check.referralCode,
            isActive: check.isActive,
            kycDocument: check.kycDocument,  
            createdAt: check.createdAt
        };

        req.session.save(err => {
            if (err) console.log(err);
            res.redirect("/user-loggedin");
        });

    } catch (err) {
        console.log(err);
        res.status(500).render("login", { error: "Server error" });
    }
});


// logout user
app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) console.log(err);
        res.redirect("/"); // Redirect to login
    });
});


// create a new user in database
app.post("/user-signup-submit", async (req, resp) => {
    function generateReferral() {
        return "NVI" + Math.floor(100000 + Math.random() * 900000);
    }
    try {
        const password = req.body.password;
        const cpassword = req.body.confirm_password;

        if (password !== cpassword) {
            return resp.send("Passwords do not match");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10); // 10 rounds

        const registerEmployee = new Register({
            username: req.body.username,
            email: req.body.email,
            phone: req.body.phone,
            password: hashedPassword,
            referralCode: generateReferral()
        });

        const registered = await registerEmployee.save();
        resp.status(201).redirect("/");

    } catch (error) {
        resp.status(400).send("error " + error.message);
    }
});


//updates 
app.post("/update-mobile", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Not logged in" });
        }

        const newPhone = req.body.phone.trim();

        // Validation
        if (!/^[0-9]{10}$/.test(newPhone)) {
            return res.json({ success: false, message: "Enter valid 10 digit number" });
        }

        const updatedUser = await Register.findByIdAndUpdate(
            req.session.user._id,
            { updated_phone: newPhone }, 
            { returnDocument: "after" }
        );

        // Update session also
        req.session.user.updated_phone = updatedUser.updated_phone;

        req.session.save(err => {
            if (err) console.log(err);
            res.json({ success: true, phone: updatedUser.updated_phone });
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/update-username", async (req, res) => {
    if (!req.session.user) return res.redirect("/");

    const newUsername = req.body.username.trim();

    const updatedUser = await Register.findByIdAndUpdate(
        req.session.user._id,
        { username: newUsername },
        { new: true }
    );

    req.session.user.username = updatedUser.username;
    req.session.save(() => {
        res.redirect("/user-loggedin");
    });
});

app.post("/update-email", async (req, res) => {
    if (!req.session.user) return res.redirect("/");

    const newEmail = req.body.email.trim();

    const updatedUser = await Register.findByIdAndUpdate(
        req.session.user._id,
        { email: newEmail },
        { new: "after" }
    );

    req.session.user.email = updatedUser.email;

    req.session.save(() => {
        res.redirect("/user-loggedin");
    });
});

app.post("/change-password", async (req, res) => {
    if (!req.session.user) return res.redirect("/");

    const { oldPassword, newPassword } = req.body;

    const user = await Register.findById(req.session.user._id);

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) return res.send("Old password incorrect");

    const hashed = await bcrypt.hash(newPassword, 10);

    user.password = hashed;
    await user.save();

    res.redirect("/user-loggedin");
});

// Multer storage for local KYC uploads
const localKycStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = '';

        if(file.mimetype.startsWith("image/")) {
            uploadPath = path.join(__dirname, 'public/kyc/images');
        } else if(file.mimetype === "application/pdf") {
            uploadPath = path.join(__dirname, 'public/kyc/docs');
        }

        // Create folder if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const userId = req.session?.user?._id || "guest";
        cb(null, `${userId}_${Date.now()}${ext}`);
    }
});

export const uploadKyc = multer({
    storage: localKycStorage,
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg","image/png","image/jpg","application/pdf"];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only JPG, PNG, or PDF allowed!"), false);
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Upload KYC to Cloudinary
app.post("/upload-kyc", uploadKycCloud.single("kycDoc"), async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).send("Not logged in");

        const filePath = req.file.path; // Cloudinary URL

        // Save KYC document + status in DB
        const updatedUser = await Register.findByIdAndUpdate(
            req.session.user._id,
            { 
                kycDocument: filePath,
                kycStatus: "Pending" // New field to track verification status
            },
            { returnDocument: "after" }
        );

        req.session.user.kycDocument = updatedUser.kycDocument;
        req.session.user.kycStatus = updatedUser.kycStatus;

        res.json({
            success: true,
            message: "KYC Uploaded Successfully",
            kycUrl: updatedUser.kycDocument,
            status: updatedUser.kycStatus
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Upload failed: " + err.message });
    }
});

app.post("/admin/toggle-status/:userId", async (req, res) => {
    const { userId } = req.params;
    const { status } = req.body;

    try {
        const user = await Register.findById(userId); // ✅ correct model
        if (!user) return res.status(404).json({ error: "User not found" });

        user.isActive = status; // true or false
        await user.save();

        res.json({ isActive: user.isActive });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

app.post("/admin/send-message", async (req, res) => {
    try {
        const { type, userId, title, message, scheduleTime } = req.body;
        const scheduledDate = scheduleTime ? new Date(scheduleTime) : null;

        if (type === "single") {
            // Create message
            const msg = await Message.create({
                userId,
                title,
                message,
                scheduledFor: scheduledDate,
                isSent: scheduledDate ? false : true
            });

            if (!scheduledDate) {
                await Notification.create({
                    user: userId,
                    title: msg.title,
                    message: msg.message
                });
            }
        } else if (type === "broadcast") {
            const msg = await Message.create({
                title,
                message,
                isBroadcast: true,
                scheduledFor: scheduledDate,
                isSent: scheduledDate ? false : true
            });

            if (!scheduledDate) {
                const users = await Register.find({});
                const notifications = users.map(u => ({
                    user: u._id,
                    title,
                    message
                }));
                await Notification.insertMany(notifications);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/user/messages", async (req, res) => {

    if (!req.session.user) return res.redirect("/");

    const messages = await Message.find({
        isSent: true,
        $or: [
            { userId: req.session.user._id },
            { isBroadcast: true }
        ]
    }).sort({ createdAt: -1 });

    res.render("user-messages", { messages });
});

// DELETE a notification
app.delete("/user/notification/:id", ensureLoggedIn, async (req, res) => {
    try {
        const notif = await Notification.findOneAndDelete({
            _id: req.params.id,
            user: req.session.user._id
        });

        if (!notif) return res.status(404).json({ success: false, message: "Notification not found" });

        res.json({ success: true, message: "Notification deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.get("/admin/messages", async (req, res) => {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.render("admin-messages", { messages });
});

// Display all notifications
app.get('/user/notifications', ensureLoggedIn, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.session.user._id })
            .sort({ createdAt: -1 }); // get all notifications

        // Only mark notifications as read AFTER fetching
        await Notification.updateMany(
            { user: req.session.user._id, read: false },
            { $set: { read: true } }
        );

        res.render('user-notifications', { notifications });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Get unread notifications count (for badge)
app.get('/user/notifications/unread-count', ensureLoggedIn, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ user: req.user._id, read: false });
        res.json({ count });
    } catch (err) {
        console.error(err);
        res.json({ count: 0 });
    }
});

// Example using Express

app.post('/admin/update-stage-kyc/:userId', async (req, res) => {
    const { userId } = req.params;
    const { stageKyc } = req.body;

    if(!stageKyc) return res.json({ success: false, message: "Stage not provided" });

    try {
        const user = await Register.findById(userId); // ✅ use Register
        if(!user) return res.json({ success: false, message: "User not found" });

        user.stageKyc = stageKyc;
        await user.save();

        res.json({ success: true, message: "Stage KYC updated successfully" });
    } catch(err) {
        console.error(err);
    }
});

app.post('/admin/update-stage-kyc/:userId', async (req, res) => {
    const { userId } = req.params;
    const { stageKyc } = req.body;

    if(!stageKyc) return res.json({ success: false, message: "Stage not provided" });

    try {
        const user = await Register.findById(userId); // ✅ use Register
        if(!user) return res.json({ success: false, message: "User not found" });

        user.stageKyc = stageKyc;
        await user.save();

        res.json({ success: true, message: "Stage KYC updated successfully" });
    } catch(err) {
        console.error(err);
        res.json({ success: false, message: "Error updating Stage KYC" });
    }
});




app.get("/new-user", (req,resp) =>{
    resp.render("signup.ejs")
})

app.get("/contactus", (req,resp) =>{
    resp.sendFile( absPathh + '/contactus.html')
})

app.get("/aboutus", (req,resp) =>{
    resp.sendFile( absPathh + '/aboutus.html')
})

app.get("/office-location", (req,resp) =>{
    resp.sendFile( absPathh + '/office-location.html')
})


app.get("/admin-dash", (req,resp) =>{
    resp.sendFile( absPathh + '/dashboard.html')
})

// Route to view all registered users
app.get("/admin/users", async (req, res) => {
    try {
        const users = await Register.find({}).sort({ createdAt: -1 }); // latest first
        res.render("users-confiedential", { users });
    } catch (err) {
        console.log(err);
        res.status(500).send("Server Error");
    }
});




cron.schedule("* * * * *", async () => {
    const now = new Date();

    const pendingMessages = await Message.find({
        isSent: false,
        scheduledFor: { $lte: now }
    });

    for (const msg of pendingMessages) {
        msg.isSent = true;
        await msg.save();

        // Create notifications
        if (msg.isBroadcast) {
            const users = await Register.find({});
            const notifs = users.map(u => ({
                user: u._id,
                title: msg.title,
                message: msg.message
            }));
            await Notification.insertMany(notifs);
        } else if (msg.userId) {
            await Notification.create({
                user: msg.userId,
                title: msg.title,
                message: msg.message
            });
        }

        console.log("Scheduled message sent:", msg.title);
    }
});




app.use( (req,resp)=>{
    resp.status(404).sendFile(absPathh + '/404.html');
} )



app.listen(port, ()=>{
    console.log(`running at ${port}`)
})