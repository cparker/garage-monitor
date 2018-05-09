
function init() {
    // displayDoor()
    // displayTemp()
    displayActivity()
}

function displayDoor() {
    fetch(`/doorStatus`)
        .then(response => {
            return response.json()
        })
        .then(data => {
            console.log('door data', data)
            const mom = moment(data.dateTime)
            page.dateTimeElm.innerHTML = mom.format('LT')
            if (data.isOpen) {
                page.statusElm.innerHTML = 'OPEN'
                page.mainElm.classList.remove('closed')
                page.mainElm.classList.add('open')
                page.lockElm.style.display = 'none'
                page.lockOpenElm.style.display = 'block'
            } else {
                page.statusElm.innerHTML = 'CLOSED'
                page.mainElm.classList.remove('open')
                page.mainElm.classList.add('closed')
                page.lockElm.style.display = 'block'
                page.lockOpenElm.style.display = 'none'
            }
        })
        .catch(error => {
            console.log('error fetching door status', error)
        })
}

function displayTemp() {
    fetch('/temp')
        .then(response => {
            return response.json()
        })
        .then(data => {
            console.log('temp data', data)
            page.currentTempElm.innerHTML = data.tempF.toFixed(1)
        })
        .catch(err => {
            console.log('error fetching temp data')
        })
}

function displayActivity() {
    console.log('displaying activity')
    fetch('./fake-door.json')
        .then(response => response.json())
        .then(rawData => {
            console.log('got door data', rawData)
            const data = rawData.map(obj => {
                obj.date = moment(obj.date).toDate()
                return obj
            })
            MG.data_graphic({
                chart_type: 'line',
                interpolate: d3.curveStep,
                data: data,
                target: '#activityChart',
                x_accessor: 'date',
                y_accessor: 'value',
                y_axis: false,
                color: 'white',
                left:5,
                right:0,
                buffer:0,
                missing_is_zero:true
            });
        })
}

function getPageElements() {
    const page = {}
    page.mainElm = document.querySelector('.main')
    page.lockElm = document.querySelector('.main .labels .icon .fa-lock')
    page.lockOpenElm = document.querySelector('.main .labels .icon .fa-lock-open')
    page.statusElm = document.querySelector('.main .text .status')
    page.dateTimeElm = document.querySelector('.main .labels .text .date-time-value')
    page.currentTempElm = document.querySelector('.main .labels .text .current-temp')
    page.activityChart = document.querySelector('#activityChart')
    return page
}


window.onload = () => {
    window.page = getPageElements()
    init()
}