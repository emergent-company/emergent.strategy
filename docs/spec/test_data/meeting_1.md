## **21st \+ LegalPlant product packages & prioritization \- 2025/08/18 11:00 CEST \- Transcript**

# **Attendees**

Maciej Kucharz, Nikolai Fasting, Robert Kopaczewski

# **Transcript**

Nikolai Fasting: for legal plant for 21st for Huma and…

Maciej Kucharz: Yeah.

Nikolai Fasting: it was also for assets front there was this product model with all those artifacts which are related to it and all that and we need to translate that into technical specifications or I think even we don't have to do that because actually I think AI could be pretty good at translating that into technical specifications if it got some kind of a guidelines if it got some kind of a  instruction on how to handle those things,  So it will be able to generate a fairly detailed technical specification and then when you have kind of a technical specification which is kind of quality controlled by humans then I think you have all you need to actually produce the let's say at least 80% good enough codes that can be deployed in a way 80% so probably 20% needs to be

Maciej Kucharz: Yeah,…

Nikolai Fasting: tweak to make it really perfect or great. Of course,…

Maciej Kucharz: it's of course hard to say now exactly how successful that can be eventually, but we have some examples that it can be very successful even with is very small context.

Maciej Kucharz: But in any case…

Maciej Kucharz: if we want to seriously go this direction that we asking AI to help us with the development to just build something and…

Nikolai Fasting: We want that.

Nikolai Fasting: I know. We want We want to do that. Yeah.

Maciej Kucharz: of course because there are multiple levels of it because as a part of the spec

Maciej Kucharz: tech in this open AI because just to also give Robert the small context open there is this open AI presai about how they are specking its an their example is how they are specking how the model should  work and they released the spec and they are showing with examples that if someone is asking let's say that question and has some sexual content let's say and of course that's a not one and zero.

Maciej Kucharz: It's like the model needs to understand a little bit what is too far with the answer or the question or what's but anyway as a humans trying discussing things which model can do which cannot do and they were basically specking that and this guy is giving a lot of examples of how this knowledge which is based on the meetings

Maciej Kucharz: and different discussions and this knowledge which is somehow developed on the way by the developer because developer is also making some decisions how this knowledge should be the part of the spec because that's basically an instruction for other developers how to do things so this is what I

Maciej Kucharz: wanted to and this is of course on very different levels because the very high level of a tech spec is okay we are using react let's say that's a very small piece of information just stating we are using react but …

Maciej Kucharz: but down there is an example when we are building a view we want to do it like that or…

Nikolai Fasting: Yep. No.

Maciej Kucharz: if we have a translation strings we are doing it like that and This is nothing more than just a knowledge which is actually there in the air and the part of the agreement between developers and the patterns which we all agreed to have or maybe not all because mainly Agata is just doing those things.

Maciej Kucharz: So we don't have a big process around that but agata has some patterns of course and Robert has some patterns in other piece of the software and so on and we want to be consequent of course and we want to remember about those things and we want that if we are asking LLM ls also take that into the account of course and…

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: and I gave the example of the strictly tech part like what's the tech and how to build components

Maciej Kucharz: that's only the part of this universe because out there is a little bit more information about the bigger context even about from the level…

### 00:05:00

Maciej Kucharz: what we are even building so can take that into account also maybe yeah yeah yeah from the product model and…

Nikolai Fasting: From the product model basically that's…

Nikolai Fasting: where it should know those things. Yeah.

Maciej Kucharz: there's a multiple thing there I believe things even naming conventions

Maciej Kucharz: and I think that for example for 21st which I believe we should just try to actually document what we have right now and I think that it can be even used to tell us in the code where are discrepancies if we are saying do you want to build the components like that you will probably find those components…

Nikolai Fasting: No, no, no.

Maciej Kucharz: which were not built like that and be able to actually clean them up a little bit for us.

Maciej Kucharz: and also another thing which I was looking into so just to conclude on this part of the discussion we won't have a spec far in the big companies and I was in such environments where there were people who were documenting for a half year such things all the time just writing and updating and agreeing on and so on which is of course horrible  able work to do if you have to do it by yourself and keep that up to date and so on. But this is why now these days is so much easier actually to do because you can ask LM to write those things for you. You can just give it some review that and it will fix it and it takes probably a fraction of that time writing that from scratch.

Maciej Kucharz: And we had this discussion I remember Nikolai when we were working on Sinano that…

Nikolai Fasting: All right.

Maciej Kucharz: if you can imagine this amazing future when just things are happening so you can instruct some very smart AI just to do things for you. what kind of work then you really need to do and the only actually work you need to do is you need to well specify what you want and that's itself is a fairly big challenge because of course you can tell this big model make me a service which is for selling cars right but then you will get exactly what you've said there will be a service for selling cars but you cannot expect the detail else.

Nikolai Fasting: and and that's the whole point of this product model model and this emergent product framework and all of those things…

Maciej Kucharz: Yeah. Yeah. Yeah.

Nikolai Fasting: because this is…

Maciej Kucharz: So…

Nikolai Fasting: where those are those things that this is…

Maciej Kucharz: how Yeah.

Nikolai Fasting: where those things are uncovered and you as a human have to make some choice  choices of directional where to take what path and what's going to be unique what's kind of going to be different and what are your competitors all sorts of things which will help the LLM to actually give you fairly good help that's what I've done with all those product models I've done it with claude and chat GPT and Gemini and it's very good at being a partner in that process but it cannot drive the process because it doesn't know what you want  you build what you believe in what you think is kind of the most successful path and so on. It doesn't know that. Yeah.

Maciej Kucharz: Yeah. Yeah. so we want to have a spec.

Maciej Kucharz: So we want to have a spec from very very high level explaining what we are building and why we are building it or the other way around why we are building it and what's the result and all the details possible to capture and…

Maciej Kucharz: all the decisions and we have it in the form which we can feed the context of every LM call basically so it's going to have a high quality results This is what we want. and I was thinking about how to achieve that.

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: And just a comment to that as well just so this becomes kind of a meta discuss a little bit.  This is also what we eventually want to provide for the boards in 21st. So because we want the boards in 21st to also have this kind of a complex and knowledge base for their company right so that they can discuss with kind of AI of course through 21st about product strategy about kind of reporting and so on so that it can be tailored to their context. so what we're doing now for 21st

Nikolai Fasting: we will also have to in a way duplicate and make available for all the different organizations on 21st right so that's…

Nikolai Fasting: how they are supposed to work as well and we want to power that through 21st

Maciej Kucharz: Yeah. Yeah.

Maciej Kucharz: But I was thinking about how to achieve that from my perspective. so there are several requirements and we have to take into account of course how to feed LLM with this information,…

### 00:10:00

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: how to gather this information, how to update this information, how to be able to have a history of the changes of this information which is because the fact of a change itself is also like a information because if we are iterating over a spec and one day we are making a decision

Maciej Kucharz: Okay, we want to change let's say one day we will agree that we are adding another market right to Sweden now beside Norway then of course the fact of that we added this to the spec it's in a way the fact of applying these changes I think LM will be very good in finding those places where we have a list of the markets and list

Nikolai Fasting: Yeah.

Maciej Kucharz: of the languages and all those places like which if the software was done in a good way it's not embedded in multiple places it's just only few places but the LM would be pretty good probably to apply such change so we have the challenge that we want to have a knowledge base which is contains a history so there's a history of the changes of this knowledge base but we want to probably review every application to the spec. So it needs to be supervised by the human. We cannot let oursel just pouring a lot of information and…

Nikolai Fasting: Yeah.

Maciej Kucharz: we don't like controlling that just committing that and just asking it to apply things on that.

Maciej Kucharz: so that's a supervised process of building this knowledge base and I was thinking initially that there should be some database of some small pieces of the information and I don't know we discussing a lot of those things on the meetings like this one and having those things somehow documented in the tickets while we creating a tickets in the clickup. so there are some we can think about it a small pieces of information in different formats in different places basically floating around and spec supposed to somehow register that okay we have this new piece of the information and we first of all l is concluding if is even relevant for the spec okay that's relevant and where to apply it and how to just organize this and apply it

Nikolai Fasting: And…

Maciej Kucharz: And yeah,…

Nikolai Fasting: I guess we should take notes from all meetings like let Gemini or AI take notes and use that as kind of input to this process of updating the knowledge base.

Maciej Kucharz: this Yeah. Yeah.

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: This is why I turned on the transcription now. and…

Nikolai Fasting: Okay. Good.

Maciej Kucharz: and I want to just after this meeting test it how good it can be to just conclude from the meeting have a key points and…

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: and have some valuable summary of what we are talking about and what we agreed on and see because some of those information obviously going to be useful for the LM to do something not always but anyway

Maciej Kucharz: so I was thinking that basically what would be the best is to I could imagine some kind of workflow where you just feeding some small piece of information and that can be chat input that can be transcription from the meeting that can be just things from the ticket or some notes from people whatever and basically the prompt of applying that to the spec is more or less like okay we are building the  spec should have that template and the spec going to be used for this. so we need basically a prompt to apply that thing. So, instruct the LM what you are really doing and probably give it also some examples.

Maciej Kucharz: So actually we have to a little bit do Nikolai what you've been doing so far in a way have a template for the model and…

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: and that's a part of the product so we want to basically gather this piece of information and have a one or multiple loops on this and eventually apply that to the spec and…

Maciej Kucharz: and also understand the version history of the spec and…

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: Yeah. Yeah.

### 00:15:00

Maciej Kucharz: and I was thinking about that it should be more like a database driven thing. So we are just pushing something to the database one record is one piece of information and the LM is basically looking through it.

Maciej Kucharz: So just taking the single record analyzing that applying it to the spec based on the prompt and…

Maciej Kucharz: everything and marking that it was processed basically in a database. so something like this.

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: I guess technically there could be different approaches considered. Of course, it could be more of a document database with the vectorzed.

Maciej Kucharz: I want to tell you about my conclusion.

Nikolai Fasting: It's kind of vector. I don't know we have to experiment, I guess.

Maciej Kucharz: So my conclusion actually for now is that we should just have it in a repository as a multiple markdown files in a one folder called spec.

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: In this spec folder, we should have also a spec template files which also we want to develop all the way a little bit…

Nikolai Fasting: Yeah. Yeah,…

Maciej Kucharz: because we don't know and we will never know fully that we want to suddenly add in this chapter some subchapter about this piece of information. So we probably want to keep those two things together a little bit and we want to instruct M saying I've just added to the template this chapter so just now apply it to the actual spec and…

Nikolai Fasting: I agree. Yeah. Yeah.

Maciej Kucharz: and the right thing there and that will give us and what we can try to do we can try to have this workflow mechanism…

Maciej Kucharz: where you just dropping really whatever piece of information in whatever format and we can just do it in Nathan

Maciej Kucharz: And that will start the workflow and it will actually produce the pull request to the repository to this spec. we can do something like that. So a good example in this transcription from this meeting…

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: Yeah. I agree.

Maciej Kucharz: if we will after that this meeting trigger something like that we will get in Nathan we will get the pull request to the specification and we can just adjust it on the way we can manually just adjust it or just reject it or whatever and that's going to be also noted that it was from this meeting in a history because git has a history by default for the files and…

Nikolai Fasting: I agree.

Maciej Kucharz: that way we can also start very slow…

Maciej Kucharz: because for now we can just start having those files and this is what I started just building for Huma very slowly and I

Nikolai Fasting: Yeah. Yep.

Maciej Kucharz: will keep continuing and I think we should try to maybe work a little bit on this template and maybe you Nicolola can work a little bit on this template how you see it like a file division ma mainly from this model side …

Nikolai Fasting: Yes. Yeah.

Maciej Kucharz: because if we right now commit that let's say to the 21st repository as a template of a spec and ask the model just spec it from what we have so far then that will already get probably some first version of the specification,…

Nikolai Fasting: Yeah. Yep. I agree.

Maciej Kucharz: right? Yeah.

Nikolai Fasting: I agree. And as we talked about before the weekend, it's also a good thing that we have two projects in We have Huma where we in a way start from scratch. We don't have anything.  So we can generate kind of a spec and then a kind of implementation from it and we also have now 21st that we need to migrate of course which will be a different type of a process.

Maciej Kucharz: And if you think about it because this is very very close at least when I was working and thinking about the flow platform which was about …

Nikolai Fasting: Okay.

Maciej Kucharz: which was about this structure right spec which you can use to generate different things on and that solution what we are trying to craft here is

Maciej Kucharz: It's solution for the exactly same problem because if you have a spec in a repository saying how we are building let's say components and then there's a pull request coming from the developer obviously you can have a LLM reviewer which is just looking into your pull request taking the spec into account and giving the feedback for the developer like okay that looks great or…

Maciej Kucharz: no it's actually not in line with the spec we have.

Maciej Kucharz: So let's fix that they make it alike this reviewer actually should control it the way like yeah we have a similar solution in other place of the code but you use that in a different way so let's just conclude on one pattern basically this is a different pattern so I think that there will be a lot of different things we can do and…

Nikolai Fasting: Yeah. No.

### 00:20:00

Nikolai Fasting: There we go.

Maciej Kucharz: what I wanted really to

Maciej Kucharz: is to try to see if I can use Nathan as this bunch of workflows or one big workflow or whatever just to help with this spec because I think that we can actually let's say for Huma because Huma for example is I have a lot of questions and…

Maciej Kucharz: of course I can generate those questions now and ask different people to answer those questions together. and we can even try to do is do it generate those questions and discuss those questions on the meeting.

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: But because you have to remember this is what me and Yun has been talking about for a long time because for instance Egil he's making a lot of soft funding applications right and those applications should he uses a lot for it but LM needs to be fed a context right it needs to be fed what are the solutions what's the physic behind it what are the different kind of modules and all those that should be from a central kind of a knowledge base right it shouldn't be something that he needs to copy paste and…

Nikolai Fasting: talk to you and get feedback. It making an application is as coding. It's the same thing basically. It's like an artifact which is an output from kind of a spec adjusted by a human. Basically, that's what it is.

Maciej Kucharz: Yeah. Yeah.

Maciej Kucharz: So I have to find somehow a way I guess going back to where we are now. We want to as fast as possible conclude on those old features for EC8 in 21st. So that's like I guess main job we need to push forward those just that part.

Nikolai Fasting: Yeah. Heat.

Maciej Kucharz: but on the side I guess maybe I will try spend 25% on working on those things because it's hard to invest in this 100% immediately because of obviously we need to do those other things but I think in this let's say 1/4 of my time I will be able to work and get to know Nathan much better actually produce useful spec for those

Maciej Kucharz: that projects and had those mechanism and I assume that eventually in a let's say few weeks of gathering specification and working with the AI and tighting together those workflows we will be able to speed up we'll be able to just do things faster at just higher quality…

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: which also means faster because it means in long term less work later right sorry for that long thing discussion.

Nikolai Fasting: I agree.

Nikolai Fasting: Any thoughts? Robert or you just take it into kind of consideration.

Robert Kopaczewski: Yeah,…

Robert Kopaczewski: I guess in general it makes sense to try something like that like Machi suggested.

Nikolai Fasting: Yeah.

Robert Kopaczewski: But yeah, we'll see how it will go. As much said, LM is not some magic piece, but it has a lot of uses.

Robert Kopaczewski: So if you manage to provide useful context this way…

Robert Kopaczewski: then we can actually get to some predictable results or more predictable

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: I think that's a point more predictable. It always needs to be somehow processed by a knowledable skilled human.

Maciej Kucharz: But I will be very happy I will be very happy for example to have a workflow in Nathan…

Nikolai Fasting: Do you see my screen? Yeah. Yeah.

Maciej Kucharz: which is looking into the basically clickup on the things which we put it there as we want to do it because that's a feedback from the client or our decision that we want to go after that thing and it's actually can process those things and tell us a little bit Okay, it seems like this ticket can be just we only need this and that and I think there's a lot of uses if we got to just connect those things.

Nikolai Fasting: I agree. I agree.

Maciej Kucharz: Yeah

Nikolai Fasting: So, let's talk through those items here then. I added a few more as well. So, we will have to try to be effective. So, the integration of ETIC ECIT is fine. I guess it's done. But there were some tweaks to the UX right that needed to be created so that Agata can add those for instance that it suggests automatically let's say a board if it's a board meeting and on. So what's the status of that? Mar about the top one here.

### 00:25:00

Nikolai Fasting: 

Maciej Kucharz: You are talking about this sorry.

Maciej Kucharz: Top one. Yeah. Yeah.

Nikolai Fasting: Yeah. Yeah. Because it's done technically but there was this missing piece of the UX and…

Nikolai Fasting: implementation of automatically suggesting let's say the board if it's signature of a board solution and all that.

Maciej Kucharz: We haven't started that yet and…

Maciej Kucharz: we haven't started that at all. I mean it's not suggesting anything.

Maciej Kucharz: you just picking people from basically because this suggestion of it was not even considered that this is…

Nikolai Fasting: So should we…

Nikolai Fasting: because as you see I made a label EC requirement. Should we just conclude that that's a future package and say that it's actually now in indev because it's assumed to be finished and good enough for now.

Maciej Kucharz: what we came out during the process. because that was not a part of the spec.

Nikolai Fasting: …

Maciej Kucharz: Yeah. But just one comment…

Nikolai Fasting: let's do that. let's do that. Let's put it there. let's see. why is dev shown here?

Maciej Kucharz: which I remember about keeping the pieces of information as a markdown. I think that's very simple solution of course and the context window is quite big. I think it looks like for me that we can always have a full spec of the product for every call as a part of the context. so maybe that's in the future it will be better to have MCP for it.

Maciej Kucharz: so the LM can query only parts of it…

Maciej Kucharz: because if it's considering just creating a techite component maybe it don't want to know about everything in the context right I want to just query the need…

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: Yeah. Yeah. Yeah. Yeah.

Maciej Kucharz: but it's actually released

Nikolai Fasting: So for dev we have landing page is actually not even on dev. I guess it's in production.  So we'll say that's production. and then we have it sign on dev and we have this add information about bankruptcy is on dev. my computer is again very slow. Let's see result. yeah. yeah. So on the next part is this.

Nikolai Fasting: Let's see what's I want. I just want to see what is struggling. I just want to see kernel task.

Nikolai Fasting: Yeah, this f\*\* kernel task starts. But it shouldn't all the time. I'm not sure what this is because it's a very insp specific thing this and that. And often it's like a spotlight indexing. It says when I'm asking what it is.

Maciej Kucharz: But you should also check the stats of your RAM…

Nikolai Fasting: You want to do it?

Maciej Kucharz: because it might be just swapping.

Nikolai Fasting: Yeah. Yeah,…

Maciej Kucharz: I mean it means just loading to the hard drive pieces of your RAM and…

Nikolai Fasting: that's probably…

Maciej Kucharz: it's quite typical thing.

Nikolai Fasting: what because this computer is minimum spec of RAM. But yeah, then we have this rethink dashboard and complete app navigation. are we starting to move towards actually working on that now? M I think it's pretty important.

Maciej Kucharz: I would say just I think what we still missing from those other things which has a higher priority is this concluding on this document types at the discover and…

Nikolai Fasting: I agree. Yeah. So this is the but I…

Maciej Kucharz: everything but the So,…

Nikolai Fasting: but I think we agree that adding more document types is for a future. That's not a requirement from EIT.  So, as long as we're able to upload the protocol. Yeah.

Maciej Kucharz: so for me what is I would say important now is only just to understand really which documents we want to take care of automatically which not but I think actually what we should do like we were talking about is that those girls from u Latia right or Latia

Nikolai Fasting: But yeah,…

Nikolai Fasting: but we have to remember there are two steps here. So one is to get Morton started. He only needs to up the upload protocol and push it for signature. We should launch that as soon as humanly possible.

### 00:30:00

Maciej Kucharz: So …

Nikolai Fasting: That's all he needs. Yeah. Yeah.

Maciej Kucharz: because in the design we have those other type of the documents like this but we should probably limit that to the agenda and the protocol for now because we don't know a lot about others or…

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: nothing about other type of the document.

Nikolai Fasting: And yeah and no one requires it or…

Maciej Kucharz: Yeah. Yeah.

Nikolai Fasting: requests having it. So for now it doesn't actually provide a solution to a known problem for anyone on using 21st. So we should conclude this adapt documents to be complete and standalone document library. So this is a requirement but we could for now limit it to actually just Morton needs to upload agenda and protocol and trigger signature. And then this setup AI infrastructure on GCP I guess it's a moving target.

Robert Kopaczewski: behind a

Nikolai Fasting: I guess we have kind of a basic infrastructure now.

Maciej Kucharz: What's

Nikolai Fasting: For now we will kind of say that it's done and we will rather define new packages. And then we have selected for development more or less I took off the priority because we should prioritize them a little bit together. So they are now in the prioritized sequence. refactoring the meeting vizard. So that's kind of making that more context aware right. much this is about making the model for making I mean depending on the phase I mean in draft mode you need something else than when you're running the meeting and so on and we should kind of go over that and make it much more user friendly and also future proof in the sense that we want to be able to manage individual agenda points attach things to individual agenda points

Nikolai Fasting: we want to show more information,…

Nikolai Fasting: we want to make it more friendly to do kind of manual protocol or notes and stuff like that. So we have a lot new features. So we should refactor that whole model for the meeting, right? And then we have this recognize and catalog more document types. This is what I added as a propar per our we should talk about that and…

Maciej Kucharz: I agree.

Maciej Kucharz: One Ready?

Nikolai Fasting: and add that at some point. Yeah.  and light features meaning we should launch some AI light features I guess we should decide for some things then I guess if we're using to recognize protocol and agenda I guess that that's AI light features those are the first ones then I guess yeah yeah and this sleek plan I'm not so sure it's more very important but it's here kind of yeah and then refactor the compliance calendar so that  It's actually kind of a data object with subobjects. So it's kind of just a flat list I guess but we want this to be categorized with an agenda and a meeting are also entries in this compliance calendar and you have deadlines which are provided by the government those are entries and other things.

Nikolai Fasting: So I work quite a lot on definition on that but that's kind of a package and then we have this p person graph classification mechanism which I guess it makes sense for you to start on Robert I reviewed it so I think it's more or less valid I added a few things so I think maybe we could have a separate meeting for that Robert just going over that and agree what to do first. Yeah. and it's important for several reasons. I think it's important because it's clear and clear for us that our approach is that we're kind of the personal governance hub, right?

Nikolai Fasting: So we want to make sure that we could provide tools for people and people are kind of the more important aspect than the organization. Of course they're representing an organization and that's kind of the context for specific kind of processes and so on but it's driven by people. So that's why this is very important.  We can talk more about it but yeah tweak the directory listing for instance we need to support 21st classification so thats is actually somehow something you can navigate based on classification this company or organization classification that we already have and I think also we should consider having in the catalog like a directory of people not only organizations but also a directory of people so that's what this is

Nikolai Fasting: out this UX of course. Yeah. yeah let's not add this here now but as part of this to classify people to know the value of the companies that representing is actually quite important.  So for that we really need some kind of a mechanism that can evaluate or value companies based on their financial data but also maybe based on their revenue and some kind of a typical valuation algorithms. Okay. yeah. So add people to directory listing that's kind of a separate.

### 00:35:00

Nikolai Fasting: tweak that's kind of also the directory. and here are some things which came from this meeting I had earlier in the summer with those configurable document folders I guess it's supposed to be per organization.

Maciej Kucharz: Okay.  Yeah.

Nikolai Fasting: I mean we have some system folders in the new setup, We have those shareholder events and board events and probably we should some other standard folders which is kind of there for everyone in a way but we should also make some of it configurable so they can add folders which fits with their flow.  And then we have this enterprise structure basically to map it's similar to this formal group structure I guess where you own 50% or more but you also may want to include organizations which you don't own 50% or more right in this structure and you may want to make some artificial nodes which are kind of more like you want to group all your init group all the accounting companies they own in one under one structure and then all the

Nikolai Fasting: tech companies under another structure because they may want to have different templates and stuff like that. so there is this kind of a way to map an organization but similar to the group structure we already have say but more where you can actually configure it yourself. I started specking that. Yeah. and we need to have on some level and non Norwegian organization support.  I mean, we have it in the catalog because we have those owners which are foreign companies which we don't handle very well because we don't fully know if they're actually companies or people. So to a large extent they're people in our directory because that's how we get them from the shareholder registry.

Nikolai Fasting: But ECIT have foreign companies that they want to manage here that they own to so on some level they need to be able to do governance for Danish companies and English companies and so on obviously with limitation that we don't have maybe initially this integration with a BRE equivalent but most of what they do kind of in the logged version of 22 is not depending on that at all. Right? it's more like it makes it easier. You don't have to actually add information manually, but other than that you don't really need it. But we need to handle that. I don't think it's a big thing, but we need to be conscious about it and those girls are to a large extent depending on exporting all sorts of things like lists of things, list of meetings, list of companies, list of this, list of that.

Nikolai Fasting: That's kind of a very common enterprise feature I would say because even if we want them to use 21st we have to just live with the fact that they are also do using shareepoint and documents and excel sheets and stuff like that we need to make it very easy for them to do kind of ad hoc governance processes on the side. And then we have this figure out first usage of Nathan which I added here.  So I mean quite a lot of things and I guess we agree that we should have those ECIT items high right? we should focus on them.

Nikolai Fasting: doesn't mean we shouldn't do anything else before they're ready, but we should kind of focus a majority of our resources on trying to nail those and close them. yeah, so figure out Nathan I guess is also high, right? Yeah.

Nikolai Fasting: Yeah and I guess this reading dashboard I guess we should rather put it on high right or something like that re the reason…

Maciej Kucharz: I'm missing a little bit this …

Nikolai Fasting: the reason why it's in progress is that I'm working on the spec for it but you're missing yeah it's here.

### 00:40:00

Maciej Kucharz: how is it was called this compliance

Maciej Kucharz: calendar where it is.

Nikolai Fasting: I talked about it. Let's see here. Refactor compliance calendar to be a real database calendar of compliance events.

Maciej Kucharz: So I think that should be pretty high…

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: because other things depends on this good agenda picker depends on that I would say. Yeah.

Nikolai Fasting: 

Nikolai Fasting: Yeah. Yeah. and the whole AI of 21st depends on that compliance calendar because that will be a major kind of knowledge source basically.

Maciej Kucharz: and also we should take into account this modification of this calendar or this customization of a calendar by the groups like this enterprise groups because that should be possible that ECIT is adding in a calendar in some proper places those additional things.

Nikolai Fasting: Yeah. Yeah.  Yeah, I think in general that that will be part of this enterprise group structure. I added just for myself some placeholders.  So to map group structure and membership hierarchy that's kind of one piece and then there's this kind of a very wide super admin for the group meeting as you said to configure kind of a standard folders standard compliance calendars standard templates standard this standard that on different levels of this kind of a group structure.  And I'm not sure if we talked about it Robert when you were present but it could be because in a way we have some strategic choices.

Nikolai Fasting: We could in a way focus our resources on being enterprise ready working tightly with EIT making them really happy make sure that they onboard all their companies and that they also offer it to all their co customers right because they're in EIT there are about 150 companies but those 150 companies have thousands of companies as clients and many of those clients are also very big companies similar size as ECIT so they would again have 150 companies and stuff like that I'm pretty sure that we have to prioritize that. But the question is should we also prioritize this other track which is more about acquisition of smaller companies this kind of a long tail this premium longtail with hundreds of thousands of clients and so on.

Nikolai Fasting: I don't know the answer to that. We may not have the resources to it. and for sure we have to actually focus on this ECIT and that kind of group enterprise thing so maybe especially if we see that ECIT are able to support us and work with us on that I guess we need to try that first because it depends a lot on them we can do things perfectly if they're not actually doing their part of Yeah.

Maciej Kucharz: Yeah. Yeah.

Maciej Kucharz: Let's see how that's going to go with them. But I would definitely for now prioritize this and see what cppler is because cppler is in a way taking that track for the acquisition of the others right and just having this marketing engine.

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: So I say and some of the things we

Nikolai Fasting: I don't know but just to point out because even if we are going the ECIT way we want to communicate to the market and…

Nikolai Fasting: build brand around that we are this kind of a enterprise AI strategic thing right yeah yeah Yeah.

Maciej Kucharz: Yeah,…

Maciej Kucharz: of course. so that's good that they're doing this and we may have a little bit more on that side features and dedicated things but I think that there's some overlap with ECAT of those things because let's say if we are just working on this with coupler on those male brick males and this and that right so that's clearly something which can work for both and going to work

Maciej Kucharz: For every new user, no matter if he's enterprise user or…

Nikolai Fasting: Yeah. Yeah. Yeah. Exactly.

Maciej Kucharz: are they all of them going to get it?

Nikolai Fasting: and we don't mind small and medium-sized companies even if we don't invest in it if we decide not to invest in it and of course if we communicate that ECIT are using this and are very happy of course it will drive traction for those small and mediumsized automatically right so that's okay that's good Yeah,…

Maciej Kucharz: Yeah. And I was thinking a little bit from those smaller guys to try to of course came out with some idea for the particular segment and the very let's say if we just want to support those kind of like a housing communities or whatever suddenly that's of course…

### 00:45:00

Nikolai Fasting: that's perfect.

Maciej Kucharz: then a separate campaign and adjusting of the small features and the

Maciej Kucharz: connected with the pricing saying just for now the normal companies paying this amount and for those communities we have that price right and…

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: so maybe we should then try to have this campaign which is in a week or two weeks going to get hundreds of signups for this particular client There

Nikolai Fasting: 

Nikolai Fasting: I agree. I think that associations could be a target like that. There are about 100,000 of them and we did some kind of research of course that very many of the board members of organizations are also board members of medium and large companies. Yeah. That's very typical. So let's quickly also try to refresh our memory on legal plant.  Although it's kind of almost like a orphanage or kind of a child which is not loved in a way which we need to try to do something about from a high level what the problem we need to solve u or decide on how to solve for legal pant is kind of how to drive sales. and this is not like a digital marketing thing mainly.

Nikolai Fasting: It's more like, there are 10,000 lawyers in Norway and they're working in 1,950 law firms. So, it's much more about kind of knocking doors. I mean, physically or digitally. So, it's more direct sales, I would say. So, and putting up kind of a rig like that, it takes time, it costs money to reach to recruit people. It takes a year before you get it working.  it can cost easily a million and it may fail basically. So we need to try to find some kind of a piggyback kind of a partnership model. so someone that has this kind of sales u rig would to target it to the same kind of market. We should try to see if we can build partnerships. Of course they won't sell our stuff as an additional thing in their portfolio. They're focusing on their things.

Nikolai Fasting: But if we can find an integration kind of where we are actually one plus one if we put our products together is stronger is more than two.

Maciej Kucharz: Yeah. Yeah.

Nikolai Fasting: And the hypothesis right now is obviously that we're trying to get this collaboration with those legal AI companies. There are mainly three ones and the ones we hope to kind of partner up with is this ai  AI and he's had this CTO there which was the CTO of one of large law firms in Norway before he's interested in that and I'm following up after summer here which in a way also drives probably a little bit the product roadmap right because then integration with them somehow making it kind of a seamless integration or smooth integration would be a priority of course and of course all the work we're doing with AI

Nikolai Fasting: in 21st should be kind of replicated over to legal plant of course. and some parts of legal plant pant should be replicated to 21st. I'm thinking about mainly the document repo integrations like the Microsoft integration and the Google integrations we have that's something we should try to bring to 21st and also the KYCL of course is something we should finish and bring to 21st because it's relevant there as well.  basically this conflict search KYC ML you're required to do that really in a company and then there are no tools really integrated for that. Okay. So that's the background.

Nikolai Fasting: So I think we in a way agreed principally at least that we will spend about 20% of our combined resources on legal pant right so that means I think you were thinking about doing one day right for legal pant a week Martin

Maciej Kucharz: Just if we are thinking about this there are some overlaps of course and…

Maciej Kucharz: since we going to work on this spec and Nathan for the 21st and I guess it's a little bit the same things we want to do in the legal plan in parallel. so I guess altogether if I will use that time for a legal plant of course like doing this for work for a legal plant but that's going to improve overall the situation of that topic for Huma and 21st and…

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: Yeah. Yeah.

Maciej Kucharz: So maybe we should also start with that a little bit there spend this time everyone going to benefit from it.

### 00:50:00

Maciej Kucharz: because I will be happy to do this marketing kind of process with Nathan having maybe a list of those lawyers and crafting very personal emails with a suggestion of a meeting just open slots in a calendar or whatever. so…

Maciej Kucharz: if we decided that we want to do it like that or maybe other way around I don't know and also I think that maybe wow

Nikolai Fasting: Just one fun fact.

Nikolai Fasting: We got our first incoming lead from the Tripleex integration. So there was this very messy weird lawyer called me on Friday and…

Nikolai Fasting: said that he was going to start using triple text and he saw when he was setting it up that there's kind of a lawyer module. I'm not sure exactly what he saw because he didn't understand it but I explained in legal path but he said I'm probably too messy to use a system. He said that's…

Maciej Kucharz: You should tell him that's exactly the way around you.

Maciej Kucharz: If you are messy you should see the assistance. Yeah.

Nikolai Fasting: 

Nikolai Fasting: that's what I try to do as a selling point. So, no, You're exactly the type of a person we want. Someone that is messy and needs better order where the legal path can help you with that eventually.

Maciej Kucharz: But …

Nikolai Fasting: Yeah. …

Maciej Kucharz: but I think that it was always a little bit we were not great in this acquisition kind of like mobile we are trying different people who supposed to know how to do it and work on it and it was not that successful I would in internal drip marketing for example mechanism so having this emails and

Nikolai Fasting: we we should do that. But I would also guess that it doesn't give us much. We should do it anyway because it doesn't cost us much. But I think the better kind of more likely approach is that saga which already have clients and making a partnership with them when…

Maciej Kucharz: but I would be happy to also refresh a little bit the legal

Nikolai Fasting: where we are together with them trying to find which one of those law firms could be the first users of legal plant and maybe not the whole legal plant but let's say parts of it let's say the KYCML module or something like that that would be kind of a better approach that's my gut feeling it probably more valuable but we need to figure out and how we could work with Saga then in that case. So that's kind of the requirement for that. Yeah. Yeah.

Maciej Kucharz: planned website in meantime and overall because it's stable it's working we don't getting even too much request and…

Nikolai Fasting: And are very happy. There's this new CEO in EIT and he came from another law firm using other systems. He says that he prefers It's much smoother, much nicer. He likes it a lot basically. so he's a very happy pilot customer.

Maciej Kucharz: yeah so we should

Nikolai Fasting: Yeah. good.

Maciej Kucharz: So I have a little bit this desire for both actually 21st and legal plan to somehow this process started with the website to start just looking on everything what we have a little bit fixing different things which we never had a lot of time to do because we wanted really so it would be nice to take a look on this and to clean up a little bit and we know that for example in plan this dashboard is not that functional so Again the same problem in 21st and yeah…

Maciej Kucharz: but definitely definitely the best would be to get another pilot customers that will be the best and in meantime we can work on

Nikolai Fasting: Yeah. Yeah.

Nikolai Fasting: I feel we need five to 10 pilot customers so we should try to work on this drip sales and marketing of course, but I think more targeted we should try to find a partnership which already has kind of law firms as clients and want to work with integration to our system.  So it doesn't make sense to come to someone that sells other things to law firms because it's very hard for them to put us in their portfolio.  there needs to be kind of a reason why they should work with us and that needs to be somehow a product reason and it seems like saga see this reason and let's see if we can kind of make them engaged u more not just think about it but actually engage in it and yeah and my suggestion because the law are going to use saga probably I will talk to the CEO here then they can be kind of the test case for that the MVP would be how to integrate saga two ways in a way so

Nikolai Fasting: from Saga you can somehow know about legal pant and put the output somehow there and the other way around you can trigger saga from legal pant easily and put the result into legal pant somehow. Yeah. and I think we should really try to see Legal Plant and 21st as sister companies more and more sharing this the same framework the same thinking the same libraries the same approach and so on because they're both governanceoriented systems. 21st very broad with many verticals and legal plan more like a very deep vertical for governance.

### 00:55:00

Nikolai Fasting: …

Maciej Kucharz: Okay. no,…

Nikolai Fasting: good, good. So, let's talk soon again. Yep. Have a nice day.

Maciej Kucharz: let's do stuff. No. Yeah. Take care, guys. Bye.

Robert Kopaczewski: Thank you again.

Nikolai Fasting: All right.

Robert Kopaczewski: made us.

### Meeting ended after 00:57:02 👋

*This editable transcript was computer generated and might contain errors. People can also change the text after it was created.*

