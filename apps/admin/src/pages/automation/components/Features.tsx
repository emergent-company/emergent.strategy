export const Features = () => {
  return (
    <div
      className="group/section container scroll-mt-12 py-8 md:py-12 lg:py-16 2xl:py-28"
      id="features"
    >
      <div className="flex items-center justify-center gap-1.5">
        <div className="bg-primary/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
        <p className="text-base-content/60 group-hover/section:text-primary font-mono text-sm font-medium transition-all">
          Highlights
        </p>
        <div className="bg-primary/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
      </div>
      <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
        Intelligence That Works for You
      </p>
      <div className="mt-2 flex justify-center text-center">
        <p className="text-base-content/80 max-w-lg">
          Emergent transforms your documents into living knowledge—connecting
          insights, tracking changes, and anticipating your needs.
        </p>
      </div>
      <div className="mt-8 grid gap-6 md:mt-12 md:grid-cols-2 lg:mt-16 xl:grid-cols-3 2xl:mt-24">
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--brain size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">
              Understands Your Domain Automatically
            </p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              No configuration needed. Emergent learns from your documents,
              recognizing patterns and connections that matter to your work
            </p>
            <div className="*:fill-base-content/5 absolute -end-6 top-4.5 flex rotate-45 items-center justify-center space-x-1.5 transition-all *:transition-all group-hover:-end-5 group-hover:top-3.5 group-hover:-space-x-3.5 group-hover:*:fill-primary">
              <svg
                className="h-9 group-hover:h-11"
                viewBox="0 0 198 122"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g clipPath="url(#clip0_275_60)">
                  <path d="M197.002 83.628C197.002 83.1024 196.899 82.5818 196.698 82.0961C196.497 81.6104 196.202 81.1691 195.83 80.7974C195.458 80.4257 195.017 80.1309 194.531 79.9298C194.046 79.7288 193.525 79.6255 192.999 79.6258H163.06L163.06 42.3754H192.999C194.061 42.3754 195.079 41.9537 195.829 41.2032C196.58 40.4526 197.002 39.4346 197.002 38.3732C197.002 37.3117 196.58 36.2937 195.829 35.5432C195.079 34.7926 194.061 34.3709 192.999 34.3709H163.06L163.06 4.43203C163.06 3.37058 162.639 2.35259 161.888 1.60203C161.138 0.851466 160.12 0.42981 159.058 0.42981C157.997 0.42981 156.979 0.851472 156.228 1.60203C155.478 2.3526 155.056 3.37058 155.056 4.43204V17.4004L118.088 17.4004C114.411 17.4002 110.77 18.1243 107.373 19.5315C103.975 20.9386 100.888 23.0012 98.288 25.6014C95.6878 28.2016 93.6252 31.2885 92.2181 34.6859C90.811 38.0833 90.0868 41.7246 90.087 45.4018L90.087 56.9984L5.92111 56.9984C4.85966 56.9984 3.84166 57.4201 3.0911 58.1706C2.34054 58.9212 1.91888 59.9392 1.91888 61.0006C1.91888 62.0621 2.34053 63.0801 3.0911 63.8306C3.84166 64.5812 4.85965 65.0028 5.92111 65.0028L90.087 65.0028L90.087 76.5994C90.0868 80.2766 90.811 83.9179 92.2181 87.3153C93.6253 90.7126 95.6878 93.7996 98.288 96.3998C100.888 99 103.975 101.063 107.373 102.47C110.77 103.877 114.411 104.601 118.088 104.601L155.056 104.601L155.056 117.569C155.056 118.631 155.478 119.649 156.228 120.399C156.979 121.15 157.997 121.571 159.058 121.571C160.12 121.571 161.138 121.15 161.888 120.399C162.639 119.649 163.06 118.631 163.06 117.569L163.06 87.6302H192.999C193.525 87.6305 194.046 87.5272 194.531 87.3262C195.017 87.1252 195.458 86.8304 195.83 86.4587C196.202 86.087 196.497 85.6457 196.698 85.16C196.899 84.6743 197.002 84.1537 197.002 83.628ZM118.067 96.6176C112.764 96.6168 107.678 94.5097 103.928 90.7597C100.178 87.0097 98.0711 81.9239 98.0703 76.6206L98.0915 45.4018C98.0923 40.0985 100.199 35.0127 103.949 31.2627C107.699 27.5127 112.785 25.4056 118.088 25.4048L155.056 25.4048L155.056 96.5964L118.067 96.6176ZM384.08 61.0006C384.08 60.475 383.977 59.9544 383.776 59.4687C383.575 58.983 383.28 58.5417 382.908 58.17C382.537 57.7983 382.095 57.5035 381.61 57.3025C381.124 57.1014 380.603 56.9981 380.078 56.9984L295.912 56.9984L295.912 45.4018C295.912 41.7246 295.188 38.0833 293.781 34.6859C292.373 31.2885 290.311 28.2016 287.711 25.6014C285.11 23.0012 282.024 20.9386 278.626 19.5315C275.229 18.1243 271.588 17.4002 267.91 17.4004L230.943 17.4004V4.43204C230.943 3.37058 230.521 2.3526 229.77 1.60204C229.02 0.851477 228.002 0.42981 226.94 0.42981C225.879 0.42981 224.861 0.851477 224.11 1.60204C223.36 2.3526 222.938 3.37059 222.938 4.43204L222.938 117.569C222.938 118.631 223.36 119.649 224.11 120.399C224.861 121.15 225.879 121.571 226.94 121.571C228.002 121.571 229.02 121.15 229.77 120.399C230.521 119.649 230.943 118.631 230.943 117.569L230.943 104.601L267.91 104.601C271.588 104.601 275.229 103.877 278.626 102.47C282.024 101.063 285.11 99 287.711 96.3998C290.311 93.7996 292.373 90.7126 293.781 87.3153C295.188 83.9179 295.912 80.2766 295.912 76.5994L295.912 65.0028L380.078 65.0028C380.603 65.0031 381.124 64.8998 381.61 64.6988C382.095 64.4978 382.537 64.203 382.908 63.8313C383.28 63.4596 383.575 63.0183 383.776 62.5326C383.977 62.0469 384.08 61.5263 384.08 61.0006ZM282.052 90.7415C280.2 92.6044 277.996 94.0811 275.568 95.0861C273.14 96.0911 270.538 96.6044 267.91 96.5963L230.943 96.5964L230.943 25.4048L267.91 25.4048C273.214 25.4056 278.299 27.5127 282.049 31.2627C285.799 35.0127 287.906 40.0985 287.907 45.4018L287.907 76.5994C287.916 79.2268 287.403 81.8298 286.398 84.2575C285.393 86.6851 283.916 88.889 282.052 90.7415Z" />
                </g>
              </svg>
              <svg
                className="h-9 group-hover:h-11"
                viewBox="0 0 164 122"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g>
                  <rect width="164" height="122" className="fill-base-100" />
                  <path d="M-24.9984 83.628C-24.9981 83.1024 -25.1014 82.5818 -25.3024 82.0961C-25.5035 81.6104 -25.7983 81.1691 -26.17 80.7974C-26.5417 80.4257 -26.983 80.1309 -27.4687 79.9298C-27.9544 79.7288 -28.475 79.6255 -29.0006 79.6258H-58.9396L-58.9395 42.3754H-29.0006C-27.9392 42.3754 -26.9212 41.9537 -26.1706 41.2032C-25.4201 40.4526 -24.9984 39.4346 -24.9984 38.3732C-24.9984 37.3117 -25.4201 36.2937 -26.1706 35.5432C-26.9212 34.7926 -27.9392 34.3709 -29.0006 34.3709H-58.9395L-58.9396 4.43203C-58.9396 3.37058 -59.3612 2.35259 -60.1118 1.60203C-60.8623 0.851466 -61.8803 0.42981 -62.9418 0.42981C-64.0032 0.42981 -65.0212 0.851472 -65.7718 1.60203C-66.5223 2.3526 -66.944 3.37058 -66.944 4.43204V17.4004L-103.912 17.4004C-107.589 17.4002 -111.23 18.1243 -114.627 19.5315C-118.025 20.9386 -121.112 23.0012 -123.712 25.6014C-126.312 28.2016 -128.375 31.2885 -129.782 34.6859C-131.189 38.0833 -131.913 41.7246 -131.913 45.4018L-131.913 56.9984L-216.079 56.9984C-217.14 56.9984 -218.158 57.4201 -218.909 58.1706C-219.659 58.9212 -220.081 59.9392 -220.081 61.0006C-220.081 62.0621 -219.659 63.0801 -218.909 63.8306C-218.158 64.5812 -217.14 65.0028 -216.079 65.0028L-131.913 65.0028L-131.913 76.5994C-131.913 80.2766 -131.189 83.9179 -129.782 87.3153C-128.375 90.7126 -126.312 93.7996 -123.712 96.3998C-121.112 99 -118.025 101.063 -114.627 102.47C-111.23 103.877 -107.589 104.601 -103.912 104.601L-66.944 104.601L-66.944 117.569C-66.944 118.631 -66.5223 119.649 -65.7718 120.399C-65.0212 121.15 -64.0032 121.571 -62.9418 121.571C-61.8803 121.571 -60.8623 121.15 -60.1118 120.399C-59.3612 119.649 -58.9395 118.631 -58.9395 117.569L-58.9396 87.6302H-29.0006C-28.475 87.6305 -27.9544 87.5272 -27.4687 87.3262C-26.983 87.1252 -26.5417 86.8304 -26.17 86.4587C-25.7983 86.087 -25.5035 85.6457 -25.3025 85.16C-25.1014 84.6743 -24.9981 84.1537 -24.9984 83.628ZM-103.933 96.6176C-109.236 96.6168 -114.322 94.5097 -118.072 90.7597C-121.822 87.0097 -123.929 81.9239 -123.93 76.6206L-123.909 45.4018C-123.908 40.0985 -121.801 35.0127 -118.051 31.2627C-114.301 27.5127 -109.215 25.4056 -103.912 25.4048L-66.944 25.4048L-66.944 96.5964L-103.933 96.6176ZM162.08 61.0006C162.08 60.475 161.977 59.9544 161.776 59.4687C161.575 58.983 161.28 58.5417 160.908 58.17C160.537 57.7983 160.095 57.5035 159.61 57.3025C159.124 57.1014 158.603 56.9981 158.078 56.9984L73.9117 56.9984L73.9117 45.4018C73.9119 41.7246 73.1877 38.0833 71.7806 34.6859C70.3735 31.2885 68.3109 28.2016 65.7107 25.6014C63.1105 23.0012 60.0235 20.9386 56.6262 19.5315C53.2288 18.1243 49.5875 17.4002 45.9103 17.4004L8.9427 17.4004V4.43204C8.9427 3.37058 8.52104 2.3526 7.77047 1.60204C7.01991 0.851477 6.00193 0.42981 4.94048 0.42981C3.87902 0.42981 2.86103 0.851477 2.11047 1.60204C1.35991 2.3526 0.938245 3.37059 0.938245 4.43204L0.938251 117.569C0.938251 118.631 1.35991 119.649 2.11048 120.399C2.86104 121.15 3.87902 121.571 4.94048 121.571C6.00193 121.571 7.01992 121.15 7.77048 120.399C8.52104 119.649 8.9427 118.631 8.9427 117.569L8.94273 104.601L45.9103 104.601C49.5875 104.601 53.2288 103.877 56.6262 102.47C60.0235 101.063 63.1105 99 65.7107 96.3998C68.3109 93.7996 70.3734 90.7126 71.7806 87.3153C73.1877 83.9179 73.9119 80.2766 73.9117 76.5994L73.9117 65.0028L158.078 65.0028C158.603 65.0031 159.124 64.8998 159.61 64.6988C160.095 64.4978 160.537 64.203 160.908 63.8313C161.28 63.4596 161.575 63.0183 161.776 62.5326C161.977 62.0469 162.08 61.5263 162.08 61.0006ZM60.0524 90.7415C58.1996 92.6044 55.9956 94.0811 53.568 95.0861C51.1405 96.0911 48.5376 96.6044 45.9103 96.5963L8.94273 96.5964L8.9427 25.4048L45.9103 25.4048C51.2135 25.4056 56.2994 27.5127 60.0494 31.2627C63.7994 35.0127 65.9064 40.0985 65.9072 45.4018L65.9072 76.5994C65.9159 79.2268 65.4028 81.8298 64.3977 84.2575C63.3927 86.6851 61.9157 88.889 60.0524 90.7415Z" />
                </g>
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--network size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">
              Connects the Dots for You
            </p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              See relationships across projects, documents, and conversations
              that you'd never spot manually
            </p>
            <div className="absolute end-1 top-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-base-content/10 h-14 transition-all duration-300 *:stroke-[1px] group-hover:h-16 group-hover:text-primary group-hover:*:stroke-[1px]"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  d="M8.628 12.674H8.17c-1.484 0-2.225 0-2.542-.49c-.316-.489-.015-1.17.588-2.533l1.812-4.098c.548-1.239.822-1.859 1.353-2.206S10.586 3 11.935 3h2.09c1.638 0 2.458 0 2.767.535c.309.536-.098 1.25-.91 2.681l-1.073 1.886c-.404.711-.606 1.066-.603 1.358c.003.378.205.726.53.917c.25.147.657.147 1.471.147c1.03 0 1.545 0 1.813.178c.349.232.531.646.467 1.061c-.049.32-.395.703-1.088 1.469l-5.535 6.12c-1.087 1.203-1.63 1.804-1.996 1.613c-.365-.19-.19-.983.16-2.569l.688-3.106c.267-1.208.4-1.812.08-2.214c-.322-.402-.937-.402-2.168-.402"
                  color="currentColor"
                />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--refresh-cw size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Evolves as You Work</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Your knowledge base grows smarter with every document, adapting to
              your organization's unique needs
            </p>
            <div className="absolute end-3.5 top-3.5">
              <svg
                className="group-hover:animate-vibrate text-base-content/5 h-10 stroke-[1.5px] transition-all group-hover:h-11 group-hover:text-orange-400"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  d="M10.268 21a2 2 0 0 0 3.464 0M22 8c0-2.3-.8-4.3-2-6M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326M4 2C2.8 3.7 2 5.7 2 8"
                />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--users size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Keeps Your Team Aligned</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Everyone works from the same up-to-date understanding, reducing
              miscommunication and duplicate effort
            </p>
            <div className="absolute end-3.5 top-3.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="group-hover:animate-wave text-base-content/5 h-10 stroke-[1.5px] transition-all group-hover:h-11 group-hover:text-primary"
                viewBox="0 0 24 24"
              >
                <g fill="none" stroke="currentColor">
                  <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2m0 4V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2m0 4.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                </g>
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--sparkles size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">
              Surfaces Insights Before You Ask
            </p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Proactive intelligence that anticipates what you need—delivering
              relevant context at the perfect moment
            </p>
            <div className="absolute end-3.5 top-3.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-base-content/5 h-10 transition-all group-hover:h-11 group-hover:text-primary"
                viewBox="0 0 24 24"
              >
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M18.955 1.25c-.433 0-.83 0-1.152.043c-.356.048-.731.16-1.04.47s-.422.684-.47 1.04c-.043.323-.043.72-.043 1.152v13.09c0 .433 0 .83.043 1.152c.048.356.16.731.47 1.04s.684.422 1.04.47c.323.043.72.043 1.152.043h.09c.433 0 .83 0 1.152-.043c.356-.048.731-.16 1.04-.47s.422-.684.47-1.04c.043-.323.043-.72.043-1.152V3.955c0-.433 0-.83-.043-1.152c-.048-.356-.16-.731-.47-1.04s-.684-.422-1.04-.47c-.323-.043-.72-.043-1.152-.043zm-1.13 1.572l-.002.001l-.001.003l-.005.01a.7.7 0 0 0-.037.167c-.028.21-.03.504-.03.997v13c0 .493.002.787.03.997a.7.7 0 0 0 .042.177l.001.003l.003.001l.003.002l.007.003c.022.009.07.024.167.037c.21.028.504.03.997.03s.787-.002.997-.03a.7.7 0 0 0 .177-.042l.003-.001l.001-.003l.005-.01a.7.7 0 0 0 .037-.167c.028-.21.03-.504.03-.997V4c0-.493-.002-.787-.03-.997a.7.7 0 0 0-.042-.177l-.001-.003l-.003-.001l-.01-.005a.7.7 0 0 0-.167-.037c-.21-.028-.504-.03-.997-.03s-.787.002-.997.03a.7.7 0 0 0-.177.042M11.955 4.25h.09c.433 0 .83 0 1.152.043c.356.048.731.16 1.04.47s.422.684.47 1.04c.043.323.043.72.043 1.152v10.09c0 .433 0 .83-.043 1.152c-.048.356-.16.731-.47 1.04s-.684.422-1.04.47c-.323.043-.72.043-1.152.043h-.09c-.432 0-.83 0-1.152-.043c-.356-.048-.731-.16-1.04-.47s-.422-.684-.47-1.04c-.043-.323-.043-.72-.043-1.152V6.955c0-.433 0-.83.043-1.152c.048-.356.16-.731.47-1.04s.684-.422 1.04-.47c.323-.043.72-.043 1.152-.043m-1.132 1.573l.003-.001l-.003 12.355l-.001-.003l-.005-.01a.7.7 0 0 1-.037-.167c-.028-.21-.03-.504-.03-.997V7c0-.493.002-.787.03-.997a.7.7 0 0 1 .042-.177zm0 12.354l.003-12.355l.003-.002l.007-.003a.7.7 0 0 1 .167-.037c.21-.028.504-.03.997-.03s.787.002.997.03a.7.7 0 0 1 .177.042l.003.001l.001.003l.005.01c.009.022.024.07.037.167c.028.21.03.504.03.997v10c0 .493-.002.787-.03.997a.7.7 0 0 1-.042.177l-.001.003l-.003.001l-.01.005a.7.7 0 0 1-.167.037c-.21.028-.504.03-.997.03s-.787-.002-.997-.03a.7.7 0 0 1-.177-.042zM4.955 8.25c-.433 0-.83 0-1.152.043c-.356.048-.731.16-1.04.47s-.422.684-.47 1.04c-.043.323-.043.72-.043 1.152v6.09c0 .433 0 .83.043 1.152c.048.356.16.731.47 1.04s.684.422 1.04.47c.323.043.72.043 1.152.043h.09c.433 0 .83 0 1.152-.043c.356-.048.731-.16 1.04-.47s.422-.684.47-1.04c.043-.323.043-.72.043-1.152v-6.09c0-.433 0-.83-.043-1.152c-.048-.356-.16-.731-.47-1.04s-.684-.422-1.04-.47c-.323-.043-.72-.043-1.152-.043zm-1.132 1.573l-.002.001l-.001.003l-.005.01a.7.7 0 0 0-.037.167c-.028.21-.03.504-.03.997v6c0 .493.002.787.03.997a.7.7 0 0 0 .042.177l.001.003l.003.001l.003.002l.007.003c.022.009.07.024.167.037c.21.028.504.03.997.03s.787-.002.997-.03a.7.7 0 0 0 .177-.042l.003-.001l.001-.003l.005-.01a.7.7 0 0 0 .037-.167c.028-.21.03-.504.03-.997v-6c0-.493-.002-.787-.03-.997a.7.7 0 0 0-.042-.177l-.001-.003l-.003-.001l-.01-.005a.7.7 0 0 0-.167-.037c-.21-.028-.504-.03-.997-.03s-.787.002-.997.03a.7.7 0 0 0-.177.042"
                />
                <path
                  fill="currentColor"
                  className="-translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
                  d="M3 21.25a.75.75 0 0 0 0 1.5h18a.75.75 0 0 0 0-1.5z"
                />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--trending-up size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">
              Grows as Your Organization Grows
            </p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              From startup to enterprise, Emergent scales effortlessly with your
              team and knowledge base
            </p>
            <div className="absolute end-4 bottom-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-8 -translate-x-1.5 stroke-[1.5px] opacity-20 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-60"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  d="m18 8l4 4l-4 4M2 12h20"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
