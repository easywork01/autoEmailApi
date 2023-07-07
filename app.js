const express = require("express");
const app = express();
const path = require("path");
const { authenticate } = require("@google-cloud/local-auth");
const fs = require("fs").promises;
const { google } = require("googleapis");

const port = 4000;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
]; // level of access that api needs from my g-mail account


const labelName = "autoReply";


app.get("/", async (req, res) => {

    const credientials = await fs.readFile("credentials.json");//load credentials from file system
 
  const auth = await authenticate({
    keyfilePath: path.join(__dirname, "credentials.json"), //accessing credentials.json file for authentication
    scopes: SCOPES,
  });//authenticating the application using the Google API client  
  //providing the credentials file path and the required scopes for accessing the Google APIs.

  // console.log("this is auth",auth)

  
  const gmail = google.gmail({ version: "v1", auth });


  
  const response = await gmail.users.labels.list({
    userId: "me",
    //stores list of all the labels of a uses Gmail account in variable 'response'
  });


  // Function to retrieve unreplied messages
  async function getUnrepliesMessages(auth) {
    const gmail = google.gmail({ version: "v1", auth });

    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "is:unread",
    });
    
    return response.data.messages || [];
  }

    // Function to create the "autoReply" label if it doesn't exist
  async function createLabel(auth) {
    const gmail = google.gmail({ version: "v1", auth });
    try {
      const response = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      return response.data.id;
    } catch (error) {
      if (error.code === 409) {
        const response = await gmail.users.labels.list({
          userId: "me",
        });
        const label = response.data.labels.find(
          (label) => label.name === labelName
        );
        return label.id;
      } else {
        throw error;
      }
    }
  }

  // Main function to handle the auto-reply logic
  async function main() {
    // Create a label for theApp
    const labelId = await createLabel(auth);
    // console.log(`Label  ${labelId}`);
   // Set interval to check for unreplied messages at random intervals between 45 to 120 seconds
    setInterval(async () => {
      //Get messages that have no prior reply
      const messages = await getUnrepliesMessages(auth);
      // console.log("Unreply messages", messages);

      //  Here i am checking is there any gmail that did not get reply
      if (messages && messages.length > 0) {
        for (const message of messages) {
          const messageData = await gmail.users.messages.get({
            auth,
            userId: "me",
            id: message.id,
          });

          const email = messageData.data;
          const hasReplied = email.payload.headers.some(
            (header) => header.name === "In-Reply-To"
          );

          if (!hasReplied) {
            // Craft the reply message
            const replyMessage = {
              userId: "me",
              resource: {
                raw: Buffer.from(
                  `To: ${
                    email.payload.headers.find(
                      (header) => header.name === "From"
                    ).value
                  }\r\n` +
                    `Subject: Re: ${
                      email.payload.headers.find(
                        (header) => header.name === "Subject"
                      ).value
                    }\r\n` +
                    `Content-Type: text/plain; charset="UTF-8"\r\n` +
                    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
                    `Thank you for your email. I'm currently on vacation and will reply to you when I return.\r\n`
                ).toString("base64"),
              },
            };

            // Send the auto-reply message
            await gmail.users.messages.send(replyMessage);

            // Modify labels of the original message to "lableID = autoReply"
            await gmail.users.messages.modify({
              auth,
              userId: "me",
              id: message.id,
              resource: {
                addLabelIds: [labelId],
                removeLabelIds: ["INBOX"],
              },
            });
          }
        }
      }
    }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);
  }


  
  main();
  // const labels = response.data.labels;
  res.json({ "this is Auth": auth });
});

app.listen(port, () => {
  console.log(`server is running ${port}`);
});