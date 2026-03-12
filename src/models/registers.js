import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
    username: {
        type:String,
        required:true
    },
    email: {
        type:String,
        required:true,
        unique:true
    },
    phone: {
        type: String,
        required: true,
        unique: true
    },
    updated_phone: {
        type:String,
        required:false 
    },
    password: {
        type:String,
        required:true
    },
    profilePic: {
       type: String,
        default: ""
    },
    role: {
        type: String, 
        default: "user" 
    },
    isActive: {
        type: Boolean,
        default: true 
    }, 
    referralCode: { 
        type: String,
        unique: true
    },

    kycDocument: { type: String },   // Cloudinary URL

}, {
    timestamps: true
});


// create a collection

const Register = new mongoose.model("Register", employeeSchema);

// module.exports = Register; --commonjs code
export default Register;